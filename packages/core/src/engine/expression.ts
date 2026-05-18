type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lparen' }
  | { t: 'rparen' }
  | { t: 'comma' }
  | { t: 'lbracket' }
  | { t: 'rbracket' }
  | { t: 'dot' };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i] as string;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < n && ((src[j]! >= '0' && src[j]! <= '9') || src[j] === '.')) j++;
      const num = Number(src.slice(i, j));
      if (!Number.isFinite(num)) throw new Error(`Invalid number at ${i}`);
      out.push({ t: 'num', v: num });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let buf = '';
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < n) { buf += src[j + 1]!; j += 2; continue; }
        buf += src[j]!;
        j++;
      }
      if (j >= n) throw new Error('Unterminated string');
      out.push({ t: 'str', v: buf });
      i = j + 1;
      continue;
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$') {
      let j = i;
      while (j < n) {
        const ch = src[j]!;
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_' || ch === '$') j++;
        else break;
      }
      out.push({ t: 'ident', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/%<>!?:'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { out.push({ t: 'lparen' }); i++; continue; }
    if (c === ')') { out.push({ t: 'rparen' }); i++; continue; }
    if (c === ',') { out.push({ t: 'comma' }); i++; continue; }
    if (c === '[') { out.push({ t: 'lbracket' }); i++; continue; }
    if (c === ']') { out.push({ t: 'rbracket' }); i++; continue; }
    if (c === '.') { out.push({ t: 'dot' }); i++; continue; }
    throw new Error(`Unexpected character '${c}' at ${i}`);
  }
  return out;
}

export type AstNode =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' }
  | { kind: 'ident'; name: string }
  | { kind: 'member'; obj: AstNode; key: string }
  | { kind: 'index'; obj: AstNode; idx: AstNode }
  | { kind: 'unary'; op: '-' | '!' | '+'; expr: AstNode }
  | { kind: 'binary'; op: string; a: AstNode; b: AstNode }
  | { kind: 'ternary'; cond: AstNode; yes: AstNode; no: AstNode }
  | { kind: 'call'; callee: string; args: AstNode[] };

class Parser {
  private p = 0;
  constructor(private tokens: Token[]) {}
  parse(): AstNode {
    const node = this.parseTernary();
    if (this.p < this.tokens.length) throw new Error('Trailing tokens in expression');
    return node;
  }
  private peek(): Token | undefined { return this.tokens[this.p]; }
  private consume(): Token {
    const t = this.tokens[this.p];
    if (!t) throw new Error('Unexpected end of expression');
    this.p++;
    return t;
  }
  private expect(t: Token['t']): void {
    const tok = this.consume();
    if (tok.t !== t) throw new Error(`Expected ${t}, got ${tok.t}`);
  }
  private parseTernary(): AstNode {
    const cond = this.parseOr();
    const t = this.peek();
    if (t && t.t === 'op' && t.v === '?') {
      this.consume();
      const yes = this.parseTernary();
      const colon = this.consume();
      if (colon.t !== 'op' || colon.v !== ':') throw new Error('Expected : in ternary');
      const no = this.parseTernary();
      return { kind: 'ternary', cond, yes, no };
    }
    return cond;
  }
  private binOp(parse: () => AstNode, ops: string[]): AstNode {
    let left = parse();
    for (;;) {
      const t = this.peek();
      if (!t || t.t !== 'op' || !ops.includes(t.v)) return left;
      this.consume();
      const right = parse();
      left = { kind: 'binary', op: t.v, a: left, b: right };
    }
  }
  private parseOr(): AstNode { return this.binOp(() => this.parseAnd(), ['||']); }
  private parseAnd(): AstNode { return this.binOp(() => this.parseEq(), ['&&']); }
  private parseEq(): AstNode { return this.binOp(() => this.parseCmp(), ['==', '!=']); }
  private parseCmp(): AstNode { return this.binOp(() => this.parseAdd(), ['<', '<=', '>', '>=']); }
  private parseAdd(): AstNode { return this.binOp(() => this.parseMul(), ['+', '-']); }
  private parseMul(): AstNode { return this.binOp(() => this.parseUnary(), ['*', '/', '%']); }
  private parseUnary(): AstNode {
    const t = this.peek();
    if (t && t.t === 'op' && (t.v === '-' || t.v === '!' || t.v === '+')) {
      this.consume();
      return { kind: 'unary', op: t.v as '-' | '!' | '+', expr: this.parseUnary() };
    }
    return this.parsePostfix();
  }
  private parsePostfix(): AstNode {
    let node = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (!t) return node;
      if (t.t === 'dot') {
        this.consume();
        const id = this.consume();
        if (id.t !== 'ident') throw new Error('Expected identifier after .');
        node = { kind: 'member', obj: node, key: id.v };
        continue;
      }
      if (t.t === 'lbracket') {
        this.consume();
        const idx = this.parseTernary();
        this.expect('rbracket');
        node = { kind: 'index', obj: node, idx };
        continue;
      }
      return node;
    }
  }
  private parsePrimary(): AstNode {
    const t = this.consume();
    if (t.t === 'num') return { kind: 'num', value: t.v };
    if (t.t === 'str') return { kind: 'str', value: t.v };
    if (t.t === 'ident') {
      if (t.v === 'true') return { kind: 'bool', value: true };
      if (t.v === 'false') return { kind: 'bool', value: false };
      if (t.v === 'null') return { kind: 'null' };
      const next = this.peek();
      if (next && next.t === 'lparen') {
        this.consume();
        const args: AstNode[] = [];
        if (this.peek()?.t !== 'rparen') {
          args.push(this.parseTernary());
          while (this.peek()?.t === 'comma') {
            this.consume();
            args.push(this.parseTernary());
          }
        }
        this.expect('rparen');
        return { kind: 'call', callee: t.v, args };
      }
      return { kind: 'ident', name: t.v };
    }
    if (t.t === 'lparen') {
      const inner = this.parseTernary();
      this.expect('rparen');
      return inner;
    }
    throw new Error(`Unexpected token ${t.t}`);
  }
}

export interface EvalContext {
  readonly row?: Record<string, unknown>;
  readonly vars?: Record<string, unknown>;
  readonly aggregates?: Record<string, unknown>;
}

function resolveNow(ctx: EvalContext): Date {
  const fromVars = ctx.vars?.printedAt;
  if (fromVars instanceof Date) return fromVars;
  if (typeof fromVars === 'string' || typeof fromVars === 'number') {
    const d = new Date(fromVars);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function resolveToday(ctx: EvalContext): Date {
  const d = resolveNow(ctx);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  return day;
}

const FN_TABLE: Record<string, (...args: unknown[]) => unknown> = {
  abs: (x) => Math.abs(Number(x)),
  round: (x) => Math.round(Number(x)),
  ceil: (x) => Math.ceil(Number(x)),
  floor: (x) => Math.floor(Number(x)),
  min: (...a) => Math.min(...a.map(Number)),
  max: (...a) => Math.max(...a.map(Number)),
  len: (x) => (Array.isArray(x) || typeof x === 'string' ? x.length : 0),
  lower: (x) => String(x ?? '').toLowerCase(),
  upper: (x) => String(x ?? '').toUpperCase(),
  trim: (x) => String(x ?? '').trim(),
  concat: (...a) => a.map((v) => (v == null ? '' : String(v))).join(''),
  if: (c, y, n) => (c ? y : n),
  coalesce: (...a) => a.find((v) => v != null) ?? null,
  not: (x) => !x,
  num: (x) => Number(x),
  str: (x) => (x == null ? '' : String(x)),
};

const MAX_OPS = 10000;

function truthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

function evalAst(n: AstNode, ctx: EvalContext, opsLeft: { v: number }): unknown {
  if (--opsLeft.v <= 0) throw new Error('Expression too complex');
  switch (n.kind) {
    case 'num': return n.value;
    case 'str': return n.value;
    case 'bool': return n.value;
    case 'null': return null;
    case 'ident': {
      if (ctx.vars && n.name in ctx.vars) return ctx.vars[n.name];
      if (ctx.aggregates && n.name in ctx.aggregates) return ctx.aggregates[n.name];
      if (ctx.row && n.name in ctx.row) return ctx.row[n.name];
      return undefined;
    }
    case 'member': {
      const obj = evalAst(n.obj, ctx, opsLeft);
      if (obj == null) return undefined;
      return (obj as Record<string, unknown>)[n.key];
    }
    case 'index': {
      const obj = evalAst(n.obj, ctx, opsLeft);
      const idx = evalAst(n.idx, ctx, opsLeft);
      if (obj == null) return undefined;
      return (obj as Record<string | number, unknown>)[idx as string | number];
    }
    case 'unary': {
      const v = evalAst(n.expr, ctx, opsLeft);
      if (n.op === '-') return -Number(v);
      if (n.op === '+') return +Number(v);
      return !truthy(v);
    }
    case 'binary': {
      if (n.op === '&&') return truthy(evalAst(n.a, ctx, opsLeft)) ? evalAst(n.b, ctx, opsLeft) : evalAst(n.a, ctx, opsLeft);
      if (n.op === '||') {
        const a = evalAst(n.a, ctx, opsLeft);
        return truthy(a) ? a : evalAst(n.b, ctx, opsLeft);
      }
      const a = evalAst(n.a, ctx, opsLeft);
      const b = evalAst(n.b, ctx, opsLeft);
      switch (n.op) {
        case '+': return typeof a === 'string' || typeof b === 'string' ? String(a ?? '') + String(b ?? '') : Number(a) + Number(b);
        case '-': return Number(a) - Number(b);
        case '*': return Number(a) * Number(b);
        case '/': return Number(b) === 0 ? NaN : Number(a) / Number(b);
        case '%': return Number(a) % Number(b);
        case '==': return a === b || (a == null && b == null);
        case '!=': return !(a === b || (a == null && b == null));
        case '<': return Number(a) < Number(b);
        case '<=': return Number(a) <= Number(b);
        case '>': return Number(a) > Number(b);
        case '>=': return Number(a) >= Number(b);
      }
      throw new Error(`Unknown operator ${n.op}`);
    }
    case 'ternary': return truthy(evalAst(n.cond, ctx, opsLeft)) ? evalAst(n.yes, ctx, opsLeft) : evalAst(n.no, ctx, opsLeft);
    case 'call': {
      const name = n.callee.toLowerCase();
      if (name === 'now') return resolveNow(ctx);
      if (name === 'today') return resolveToday(ctx);
      const fn = FN_TABLE[name];
      if (!fn) throw new Error(`Unknown function: ${n.callee}`);
      const args = n.args.map((a) => evalAst(a, ctx, opsLeft));
      return fn(...args);
    }
  }
}

const cache = new Map<string, AstNode>();

export function compile(source: string): AstNode {
  const cached = cache.get(source);
  if (cached) return cached;
  const tokens = tokenize(source);
  const ast = new Parser(tokens).parse();
  if (cache.size > 500) cache.clear();
  cache.set(source, ast);
  return ast;
}

export function evaluate(source: string, ctx: EvalContext = {}): unknown {
  const ast = compile(source);
  return evalAst(ast, ctx, { v: MAX_OPS });
}

export function tryEvaluate(source: string, ctx: EvalContext = {}): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: evaluate(source, ctx) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
