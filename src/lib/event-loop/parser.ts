/**
 * A small hand-written parser for the slice of JavaScript the playground
 * executes. It deliberately stops short of the full language — no classes,
 * generators, regex literals, labels, or modules — because every construct
 * here has to be *steppable*, and an unsupported one is better reported as a
 * clear error than silently mis-run.
 *
 * Every node carries the 1-based source line so the visualiser can point at
 * the statement it is currently executing.
 */

export type Node = { type: string; line: number; [key: string]: unknown };

export class ParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType = "num" | "str" | "template" | "name" | "punct" | "eof";

type Token = {
  type: TokenType;
  value: string;
  line: number;
  /** Cooked string value for `str`. */
  str?: string;
  /** Raw source of a template literal, without the enclosing backticks. */
  raw?: string;
};

const KEYWORDS = new Set([
  "var", "let", "const", "function", "return", "if", "else", "for", "of", "in",
  "while", "do", "break", "continue", "try", "catch", "finally", "throw",
  "new", "typeof", "void", "delete", "async", "await", "true", "false", "null",
  "undefined", "instanceof", "this",
]);

/** Longest-first, so `===` wins over `==` wins over `=`. */
const PUNCTUATORS = [
  "...", "===", "!==", "**=", "??=", "&&=", "||=",
  "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "**",
  "++", "--", "+=", "-=", "*=", "/=", "%=",
  "{", "}", "(", ")", "[", "]", ";", ",", "<", ">", "+", "-", "*", "/", "%",
  "=", "!", "?", ":", ".", "&", "|", "^", "~",
];

function isIdStart(c: string) {
  return /[A-Za-z_$]/.test(c);
}

function isIdPart(c: string) {
  return /[A-Za-z0-9_$]/.test(c);
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;

  /** Reads one backslash escape, with `i` sitting on the backslash. */
  const readEscape = (): string => {
    i++;
    const c = src[i++];
    switch (c) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "0": return "\0";
      case "\n": line++; return "";
      default: return c ?? "";
    }
  };

  while (i < src.length) {
    const c = src[i];

    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }

    // Comments
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const start = i;
      while (i < src.length && /[0-9._eExXbBoOa-fA-F]/.test(src[i])) {
        // Stop at a `.` that begins a method call rather than a decimal point.
        if (src[i] === "." && !/[0-9]/.test(src[i + 1] ?? "")) break;
        i++;
      }
      tokens.push({ type: "num", value: src.slice(start, i).replace(/_/g, ""), line });
      continue;
    }

    // Strings
    if (c === '"' || c === "'") {
      const quote = c;
      const startLine = line;
      i++;
      let out = "";
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          out += readEscape();
        } else {
          if (src[i] === "\n") line++;
          out += src[i++];
        }
      }
      if (i >= src.length) throw new ParseError("Unterminated string", startLine);
      i++;
      tokens.push({ type: "str", value: quote + out + quote, str: out, line: startLine });
      continue;
    }

    // Template literals, captured raw. The parser re-parses the `${}` holes.
    if (c === "`") {
      const startLine = line;
      i++;
      const start = i;
      let depth = 0;
      while (i < src.length) {
        const ch = src[i];
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === "\n") line++;
        if (ch === "$" && src[i + 1] === "{") {
          depth++;
          i += 2;
          continue;
        }
        if (ch === "}" && depth > 0) {
          depth--;
          i++;
          continue;
        }
        if (ch === "`" && depth === 0) break;
        i++;
      }
      if (i >= src.length) throw new ParseError("Unterminated template literal", startLine);
      tokens.push({ type: "template", value: "`", raw: src.slice(start, i), line: startLine });
      i++;
      continue;
    }

    // Identifiers and keywords
    if (isIdStart(c)) {
      const start = i;
      while (i < src.length && isIdPart(src[i])) i++;
      tokens.push({ type: "name", value: src.slice(start, i), line });
      continue;
    }

    const punct = PUNCTUATORS.find((p) => src.startsWith(p, i));
    if (punct) {
      tokens.push({ type: "punct", value: punct, line });
      i += punct.length;
      continue;
    }

    throw new ParseError(`Unexpected character ${JSON.stringify(c)}`, line);
  }

  tokens.push({ type: "eof", value: "", line });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Binding powers. `**` is the only right-associative operator here. */
const BINARY_PRECEDENCE: Record<string, number> = {
  "??": 1, "||": 2, "&&": 3,
  "|": 4, "^": 5, "&": 6,
  "==": 7, "!=": 7, "===": 7, "!==": 7,
  "<": 8, ">": 8, "<=": 8, ">=": 8, instanceof: 8, in: 8,
  "+": 10, "-": 10,
  "*": 11, "/": 11, "%": 11,
  "**": 12,
};

const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "??=", "&&=", "||="]);

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private get line(): number {
    return this.peek().line;
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private is(value: string, offset = 0): boolean {
    const t = this.peek(offset);
    return (t.type === "punct" || t.type === "name") && t.value === value;
  }

  private eat(value: string): boolean {
    if (this.is(value)) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expect(value: string): Token {
    if (!this.is(value)) {
      const got = this.peek().type === "eof" ? "end of input" : JSON.stringify(this.peek().value);
      throw new ParseError(`Expected ${JSON.stringify(value)} but found ${got}`, this.line);
    }
    return this.next();
  }

  /** Consumes an optional semicolon; ASI is approximated as "it's optional". */
  private semicolon() {
    this.eat(";");
  }

  parseProgram(): Node {
    const line = this.line;
    const body: Node[] = [];
    while (this.peek().type !== "eof") body.push(this.parseStatement());
    return { type: "Program", line, body };
  }

  // -- statements ----------------------------------------------------------

  private parseStatement(): Node {
    const t = this.peek();
    const line = t.line;

    if (t.type === "punct" && t.value === "{") return this.parseBlock();
    if (t.type === "punct" && t.value === ";") {
      this.next();
      return { type: "EmptyStatement", line };
    }

    if (t.type === "name") {
      switch (t.value) {
        case "var":
        case "let":
        case "const": {
          const decl = this.parseVariableDeclaration();
          this.semicolon();
          return decl;
        }
        case "function":
          return this.parseFunction(true, false);
        case "async":
          if (this.is("function", 1)) {
            this.next();
            return this.parseFunction(true, true);
          }
          break;
        case "return": {
          this.next();
          const noArgument =
            this.is(";") || this.is("}") || this.peek().type === "eof" || this.peek().line !== line;
          const argument = noArgument ? null : this.parseExpression();
          this.semicolon();
          return { type: "ReturnStatement", line, argument };
        }
        case "if": {
          this.next();
          this.expect("(");
          const test = this.parseExpression();
          this.expect(")");
          const consequent = this.parseStatement();
          const alternate = this.eat("else") ? this.parseStatement() : null;
          return { type: "IfStatement", line, test, consequent, alternate };
        }
        case "for":
          return this.parseFor();
        case "while": {
          this.next();
          this.expect("(");
          const test = this.parseExpression();
          this.expect(")");
          return { type: "WhileStatement", line, test, body: this.parseStatement() };
        }
        case "do": {
          this.next();
          const body = this.parseStatement();
          this.expect("while");
          this.expect("(");
          const test = this.parseExpression();
          this.expect(")");
          this.semicolon();
          return { type: "DoWhileStatement", line, body, test };
        }
        case "break":
          this.next();
          this.semicolon();
          return { type: "BreakStatement", line };
        case "continue":
          this.next();
          this.semicolon();
          return { type: "ContinueStatement", line };
        case "throw": {
          this.next();
          const argument = this.parseExpression();
          this.semicolon();
          return { type: "ThrowStatement", line, argument };
        }
        case "try":
          return this.parseTry();
        case "class":
          throw new ParseError("`class` is not supported by the playground interpreter", line);
      }
    }

    const expression = this.parseExpression();
    this.semicolon();
    return { type: "ExpressionStatement", line, expression };
  }

  private parseBlock(): Node {
    const line = this.line;
    this.expect("{");
    const body: Node[] = [];
    while (!this.is("}")) {
      if (this.peek().type === "eof") {
        throw new ParseError("Unexpected end of input, missing `}`", this.line);
      }
      body.push(this.parseStatement());
    }
    this.expect("}");
    return { type: "BlockStatement", line, body };
  }

  private parseVariableDeclaration(): Node {
    const line = this.line;
    const kind = this.next().value;
    const declarations: Node[] = [];
    do {
      const id = this.parsePattern();
      const init = this.eat("=") ? this.parseAssignment() : null;
      declarations.push({ type: "VariableDeclarator", line, id, init });
    } while (this.eat(","));
    return { type: "VariableDeclaration", line, kind, declarations };
  }

  private parseFor(): Node {
    const line = this.line;
    this.expect("for");
    this.expect("(");

    let init: Node | null = null;
    if (!this.is(";")) {
      init =
        this.is("var") || this.is("let") || this.is("const")
          ? this.parseVariableDeclaration()
          : {
              type: "ExpressionStatement",
              line: this.line,
              expression: this.parseExpression(),
            };
    }

    // `for (… of …)` — whatever was parsed above is the left-hand side.
    if (this.is("of")) {
      this.next();
      const right = this.parseAssignment();
      this.expect(")");
      return { type: "ForOfStatement", line, left: init, right, body: this.parseStatement() };
    }
    if (this.is("in")) {
      throw new ParseError("`for…in` is not supported; use `for…of` over Object.keys()", line);
    }

    this.expect(";");
    const test = this.is(";") ? null : this.parseExpression();
    this.expect(";");
    const update = this.is(")") ? null : this.parseExpression();
    this.expect(")");
    return { type: "ForStatement", line, init, test, update, body: this.parseStatement() };
  }

  private parseTry(): Node {
    const line = this.line;
    this.expect("try");
    const block = this.parseBlock();

    let handler: Node | null = null;
    if (this.eat("catch")) {
      const handlerLine = this.line;
      let param: Node | null = null;
      if (this.eat("(")) {
        param = this.parsePattern();
        this.expect(")");
      }
      handler = { type: "CatchClause", line: handlerLine, param, body: this.parseBlock() };
    }

    const finalizer = this.eat("finally") ? this.parseBlock() : null;
    if (!handler && !finalizer) throw new ParseError("`try` needs a `catch` or `finally`", line);
    return { type: "TryStatement", line, block, handler, finalizer };
  }

  /**
   * Parses a binding target: a plain name, or an array/object destructuring
   * pattern. Nested patterns and defaults work; rest elements are only
   * supported in final position.
   */
  private parsePattern(): Node {
    const line = this.line;

    if (this.is("[")) {
      this.next();
      const elements: (Node | null)[] = [];
      while (!this.is("]")) {
        if (this.is(",")) {
          this.next();
          elements.push(null);
          continue;
        }
        elements.push(
          this.eat("...")
            ? { type: "RestElement", line: this.line, argument: this.parsePattern() }
            : this.parsePatternWithDefault(),
        );
        if (!this.is("]")) this.expect(",");
      }
      this.expect("]");
      return { type: "ArrayPattern", line, elements };
    }

    if (this.is("{")) {
      this.next();
      const properties: Node[] = [];
      let rest: Node | null = null;
      while (!this.is("}")) {
        if (this.eat("...")) {
          rest = this.parsePattern();
        } else {
          const keyToken = this.next();
          const key = keyToken.type === "str" ? (keyToken.str ?? "") : keyToken.value;
          const value = this.eat(":")
            ? this.parsePatternWithDefault()
            : this.withDefault({ type: "Identifier", line: keyToken.line, name: key });
          properties.push({ type: "PropertyPattern", line: keyToken.line, key, value });
        }
        if (!this.is("}")) this.expect(",");
      }
      this.expect("}");
      return { type: "ObjectPattern", line, properties, rest };
    }

    const t = this.next();
    if (t.type !== "name") {
      throw new ParseError(`Expected a binding name, found ${JSON.stringify(t.value)}`, t.line);
    }
    return { type: "Identifier", line: t.line, name: t.value };
  }

  private parsePatternWithDefault(): Node {
    return this.withDefault(this.parsePattern());
  }

  private withDefault(pattern: Node): Node {
    if (this.eat("=")) {
      return {
        type: "AssignmentPattern",
        line: pattern.line,
        left: pattern,
        right: this.parseAssignment(),
      };
    }
    return pattern;
  }

  // -- functions -----------------------------------------------------------

  private parseFunction(isDeclaration: boolean, isAsync: boolean): Node {
    const line = this.line;
    this.expect("function");
    let name: string | null = null;
    if (this.peek().type === "name" && !this.is("(")) name = this.next().value;
    const params = this.parseParams();
    const body = this.parseBlock();
    return {
      type: isDeclaration ? "FunctionDeclaration" : "FunctionExpression",
      line,
      name,
      params,
      body,
      async: isAsync,
      expression: false,
    };
  }

  private parseParams(): Node[] {
    this.expect("(");
    const params: Node[] = [];
    while (!this.is(")")) {
      params.push(
        this.eat("...")
          ? { type: "RestElement", line: this.line, argument: this.parsePattern() }
          : this.parsePatternWithDefault(),
      );
      if (!this.is(")")) this.expect(",");
    }
    this.expect(")");
    return params;
  }

  /**
   * Decides whether a `(` opens arrow-function parameters or a parenthesised
   * expression, by scanning to the matching `)` and looking for `=>`.
   */
  private isArrowAhead(offset = 0): boolean {
    let depth = 0;
    let i = offset;
    for (;;) {
      const t = this.peek(i);
      if (t.type === "eof") return false;
      if (t.type === "punct") {
        if (t.value === "(" || t.value === "[" || t.value === "{") {
          depth++;
        } else if (t.value === ")" || t.value === "]" || t.value === "}") {
          depth--;
          if (depth === 0) return this.is("=>", i + 1);
        }
      }
      i++;
    }
  }

  private parseArrow(isAsync: boolean): Node {
    const line = this.line;
    const params = this.is("(")
      ? this.parseParams()
      : [{ type: "Identifier", line: this.line, name: this.next().value } as Node];
    this.expect("=>");
    const expression = !this.is("{");
    const body = expression ? this.parseAssignment() : this.parseBlock();
    return {
      type: "ArrowFunctionExpression",
      line,
      name: null,
      params,
      body,
      async: isAsync,
      expression,
    };
  }

  // -- expressions ---------------------------------------------------------

  parseExpression(): Node {
    const first = this.parseAssignment();
    if (!this.is(",")) return first;
    const expressions = [first];
    while (this.eat(",")) expressions.push(this.parseAssignment());
    return { type: "SequenceExpression", line: first.line, expressions };
  }

  private parseAssignment(): Node {
    // Arrow functions are detected first: their parameter list is otherwise
    // indistinguishable from a parenthesised expression.
    if (this.is("async") && !this.is("=>", 1)) {
      if (this.peek(1).type === "name" && this.is("=>", 2)) {
        this.next();
        return this.parseArrow(true);
      }
      if (this.is("(", 1) && this.isArrowAhead(1)) {
        this.next();
        return this.parseArrow(true);
      }
    }
    if (this.peek().type === "name" && !KEYWORDS.has(this.peek().value) && this.is("=>", 1)) {
      return this.parseArrow(false);
    }
    if (this.is("(") && this.isArrowAhead()) return this.parseArrow(false);

    const left = this.parseConditional();
    const t = this.peek();
    if (t.type === "punct" && ASSIGN_OPS.has(t.value)) {
      this.next();
      const right = this.parseAssignment();
      return { type: "AssignmentExpression", line: left.line, operator: t.value, left, right };
    }
    return left;
  }

  private parseConditional(): Node {
    const test = this.parseBinary(0);
    if (!this.is("?")) return test;
    this.next();
    const consequent = this.parseAssignment();
    this.expect(":");
    const alternate = this.parseAssignment();
    return { type: "ConditionalExpression", line: test.line, test, consequent, alternate };
  }

  private parseBinary(minPrecedence: number): Node {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      const op = t.value;
      const precedence =
        t.type === "punct" || t.type === "name" ? BINARY_PRECEDENCE[op] : undefined;
      if (precedence === undefined || precedence < minPrecedence) return left;
      this.next();
      // `**` is right-associative; everything else binds to the left.
      const right = this.parseBinary(op === "**" ? precedence : precedence + 1);
      const type = op === "&&" || op === "||" || op === "??" ? "LogicalExpression" : "BinaryExpression";
      left = { type, line: left.line, operator: op, left, right };
    }
  }

  private parseUnary(): Node {
    const t = this.peek();
    const line = t.line;

    if (t.type === "punct" && (t.value === "!" || t.value === "-" || t.value === "+" || t.value === "~")) {
      this.next();
      return { type: "UnaryExpression", line, operator: t.value, argument: this.parseUnary() };
    }
    if (t.type === "name" && (t.value === "typeof" || t.value === "void" || t.value === "delete")) {
      this.next();
      return { type: "UnaryExpression", line, operator: t.value, argument: this.parseUnary() };
    }
    if (t.type === "name" && t.value === "await") {
      this.next();
      return { type: "AwaitExpression", line, argument: this.parseUnary() };
    }
    if (t.type === "punct" && (t.value === "++" || t.value === "--")) {
      this.next();
      return {
        type: "UpdateExpression",
        line,
        operator: t.value,
        prefix: true,
        argument: this.parseUnary(),
      };
    }

    const argument = this.parsePostfix();
    const after = this.peek();
    if (
      after.type === "punct" &&
      (after.value === "++" || after.value === "--") &&
      after.line === argument.line
    ) {
      this.next();
      return { type: "UpdateExpression", line, operator: after.value, prefix: false, argument };
    }
    return argument;
  }

  private parsePostfix(): Node {
    let expr = this.is("new") ? this.parseNew() : this.parsePrimary();

    for (;;) {
      if (this.eat(".")) {
        const prop = this.next();
        expr = {
          type: "MemberExpression",
          line: expr.line,
          object: expr,
          property: prop.value,
          computed: false,
          optional: false,
        };
      } else if (this.is("?.")) {
        this.next();
        if (this.is("(")) {
          expr = {
            type: "CallExpression",
            line: expr.line,
            callee: expr,
            arguments: this.parseArguments(),
            optional: true,
          };
        } else if (this.is("[")) {
          this.next();
          const property = this.parseExpression();
          this.expect("]");
          expr = {
            type: "MemberExpression",
            line: expr.line,
            object: expr,
            property,
            computed: true,
            optional: true,
          };
        } else {
          const prop = this.next();
          expr = {
            type: "MemberExpression",
            line: expr.line,
            object: expr,
            property: prop.value,
            computed: false,
            optional: true,
          };
        }
      } else if (this.is("[")) {
        this.next();
        const property = this.parseExpression();
        this.expect("]");
        expr = {
          type: "MemberExpression",
          line: expr.line,
          object: expr,
          property,
          computed: true,
          optional: false,
        };
      } else if (this.is("(")) {
        expr = {
          type: "CallExpression",
          line: expr.line,
          callee: expr,
          arguments: this.parseArguments(),
          optional: false,
        };
      } else {
        return expr;
      }
    }
  }

  private parseNew(): Node {
    const line = this.line;
    this.expect("new");
    // Only `new Callee(...)` with a plain or dotted callee is supported.
    let callee = this.parsePrimary();
    while (this.eat(".")) {
      const prop = this.next();
      callee = {
        type: "MemberExpression",
        line,
        object: callee,
        property: prop.value,
        computed: false,
        optional: false,
      };
    }
    const args = this.is("(") ? this.parseArguments() : [];
    return { type: "NewExpression", line, callee, arguments: args };
  }

  private parseArguments(): Node[] {
    this.expect("(");
    const args: Node[] = [];
    while (!this.is(")")) {
      args.push(
        this.eat("...")
          ? { type: "SpreadElement", line: this.line, argument: this.parseAssignment() }
          : this.parseAssignment(),
      );
      if (!this.is(")")) this.expect(",");
    }
    this.expect(")");
    return args;
  }

  private parsePrimary(): Node {
    const t = this.peek();
    const line = t.line;

    if (t.type === "num") {
      this.next();
      return { type: "Literal", line, value: Number(t.value) };
    }
    if (t.type === "str") {
      this.next();
      return { type: "Literal", line, value: t.str ?? "" };
    }
    if (t.type === "template") {
      this.next();
      return this.buildTemplate(t);
    }

    if (t.type === "punct") {
      if (t.value === "(") {
        this.next();
        const expr = this.parseExpression();
        this.expect(")");
        return expr;
      }
      if (t.value === "[") {
        this.next();
        const elements: Node[] = [];
        while (!this.is("]")) {
          elements.push(
            this.eat("...")
              ? { type: "SpreadElement", line: this.line, argument: this.parseAssignment() }
              : this.parseAssignment(),
          );
          if (!this.is("]")) this.expect(",");
        }
        this.expect("]");
        return { type: "ArrayExpression", line, elements };
      }
      if (t.value === "{") return this.parseObjectLiteral();
    }

    if (t.type === "name") {
      switch (t.value) {
        case "true":
          this.next();
          return { type: "Literal", line, value: true };
        case "false":
          this.next();
          return { type: "Literal", line, value: false };
        case "null":
          this.next();
          return { type: "Literal", line, value: null };
        case "undefined":
          this.next();
          return { type: "Literal", line, value: undefined };
        case "this":
          this.next();
          return { type: "ThisExpression", line };
        case "function":
          return this.parseFunction(false, false);
        case "async":
          if (this.is("function", 1)) {
            this.next();
            return this.parseFunction(false, true);
          }
          break;
      }
      this.next();
      return { type: "Identifier", line, name: t.value };
    }

    throw new ParseError(
      t.type === "eof" ? "Unexpected end of input" : `Unexpected token ${JSON.stringify(t.value)}`,
      line,
    );
  }

  private parseObjectLiteral(): Node {
    const line = this.line;
    this.expect("{");
    const properties: Node[] = [];

    while (!this.is("}")) {
      if (this.eat("...")) {
        properties.push({ type: "SpreadElement", line: this.line, argument: this.parseAssignment() });
      } else {
        const propLine = this.line;
        let key: string | Node;
        let computed = false;

        if (this.is("[")) {
          this.next();
          key = this.parseAssignment();
          computed = true;
          this.expect("]");
        } else {
          const keyToken = this.next();
          key = keyToken.type === "str" ? (keyToken.str ?? "") : keyToken.value;
        }

        let value: Node;
        if (this.is("(")) {
          // Shorthand method: `{ run() { … } }`.
          const params = this.parseParams();
          value = {
            type: "FunctionExpression",
            line: propLine,
            name: typeof key === "string" ? key : null,
            params,
            body: this.parseBlock(),
            async: false,
            expression: false,
          };
        } else if (this.eat(":")) {
          value = this.parseAssignment();
        } else {
          // Shorthand property: `{ x }`.
          value = { type: "Identifier", line: propLine, name: key as string };
        }
        properties.push({ type: "Property", line: propLine, key, computed, value });
      }
      if (!this.is("}")) this.expect(",");
    }

    this.expect("}");
    return { type: "ObjectExpression", line, properties };
  }

  /**
   * Splits a raw template body into literal chunks and `${}` holes, then
   * re-parses each hole as a standalone expression.
   */
  private buildTemplate(token: Token): Node {
    const raw = token.raw ?? "";
    const quasis: string[] = [];
    const expressions: Node[] = [];
    let current = "";
    let i = 0;

    while (i < raw.length) {
      if (raw[i] === "\\") {
        const c = raw[i + 1];
        current += c === "n" ? "\n" : c === "t" ? "\t" : (c ?? "");
        i += 2;
        continue;
      }
      if (raw[i] === "$" && raw[i + 1] === "{") {
        let depth = 1;
        let j = i + 2;
        while (j < raw.length && depth > 0) {
          if (raw[j] === "{") depth++;
          else if (raw[j] === "}") depth--;
          if (depth > 0) j++;
        }
        const source = raw.slice(i + 2, j);
        quasis.push(current);
        current = "";
        const sub = new Parser(tokenize(source));
        // Holes inherit the template's line so highlighting stays sensible.
        expressions.push({ ...sub.parseExpression(), line: token.line });
        i = j + 1;
        continue;
      }
      current += raw[i++];
    }

    quasis.push(current);
    return { type: "TemplateLiteral", line: token.line, quasis, expressions };
  }
}

export function parse(source: string): Node {
  return new Parser(tokenize(source)).parseProgram();
}
