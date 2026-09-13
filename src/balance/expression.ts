/**
 * A tiny expression language for reading values out of a balance response.
 *
 * It deliberately avoids `eval` and `new Function`: a balance query is
 * user-supplied configuration, and evaluating arbitrary JavaScript inside the
 * extension host would hand that configuration the extension's full
 * privileges. The grammar only covers what a balance endpoint needs — field
 * paths and arithmetic:
 *
 *   balance_infos[0].total_balance
 *   data.total_credits - data.total_usage
 *   data.quota / 500000
 *   "USD"
 *   limits[unit == 3].percentage
 *   model_remains[model_name == "general"].current_interval_remaining_percent
 */

/** Picks the first array element whose `field` equals `value`. */
interface PathSelector {
	field: string;
	value: string | number;
	/** Set by `!=`, which picks the first element that does not match. */
	negate?: boolean;
}

/** One step of a path: an object key, an array index, or an array selector. */
type PathSegment = string | number | PathSelector;

type Node =
	| { kind: "number"; value: number }
	| { kind: "string"; value: string }
	| { kind: "path"; segments: ReadonlyArray<PathSegment> }
	| { kind: "negate"; operand: Node }
	| { kind: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node };

interface Token {
	type: "number" | "string" | "ident" | "punct";
	value: string;
	/** Offset of the token in the source, used to build readable errors. */
	at: number;
}

export class BalanceExpressionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BalanceExpressionError";
	}
}

function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;
	while (index < source.length) {
		const char = source[index];
		if (/\s/.test(char)) {
			index += 1;
			continue;
		}
		if (char === '"' || char === "'") {
			const quote = char;
			let value = "";
			let cursor = index + 1;
			let closed = false;
			while (cursor < source.length) {
				const current = source[cursor];
				if (current === "\\" && cursor + 1 < source.length) {
					value += source[cursor + 1];
					cursor += 2;
					continue;
				}
				if (current === quote) {
					closed = true;
					cursor += 1;
					break;
				}
				value += current;
				cursor += 1;
			}
			if (!closed) {
				throw new BalanceExpressionError(`Unterminated string starting at position ${index}.`);
			}
			tokens.push({ type: "string", value, at: index });
			index = cursor;
			continue;
		}
		if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(source[index + 1] ?? ""))) {
			let cursor = index;
			while (cursor < source.length && /[0-9._]/.test(source[cursor])) {
				cursor += 1;
			}
			// Scientific notation, e.g. 1e6 or 2.5E-3.
			if (/[eE]/.test(source[cursor] ?? "") && /[0-9+-]/.test(source[cursor + 1] ?? "")) {
				cursor += 2;
				while (cursor < source.length && /[0-9]/.test(source[cursor])) {
					cursor += 1;
				}
			}
			const raw = source.slice(index, cursor).replace(/_/g, "");
			const value = Number(raw);
			if (!Number.isFinite(value)) {
				throw new BalanceExpressionError(`"${source.slice(index, cursor)}" is not a valid number.`);
			}
			tokens.push({ type: "number", value: raw, at: index });
			index = cursor;
			continue;
		}
		if (/[\p{L}_$]/u.test(char)) {
			let cursor = index;
			while (cursor < source.length && /[\p{L}\p{N}_$-]/u.test(source[cursor])) {
				cursor += 1;
			}
			tokens.push({ type: "ident", value: source.slice(index, cursor), at: index });
			index = cursor;
			continue;
		}
		if (char === "=" || char === "!") {
			// `==` and `!=` only appear inside a path selector, but tokenising them
			// here keeps the parser free of character-level lookahead.
			if (source[index + 1] !== "=") {
				throw new BalanceExpressionError(`Unexpected character "${char}" at position ${index}.`);
			}
			tokens.push({ type: "punct", value: `${char}=`, at: index });
			index += 2;
			continue;
		}
		if ("+-*/()[].".includes(char)) {
			tokens.push({ type: "punct", value: char, at: index });
			index += 1;
			continue;
		}
		throw new BalanceExpressionError(`Unexpected character "${char}" at position ${index}.`);
	}
	return tokens;
}

class Parser {
	private index = 0;

	constructor(private readonly tokens: readonly Token[]) {}

	parse(): Node {
		const node = this.parseExpression();
		if (this.index < this.tokens.length) {
			const token = this.tokens[this.index];
			throw new BalanceExpressionError(`Unexpected "${token.value}" at position ${token.at}.`);
		}
		return node;
	}

	private peek(): Token | undefined {
		return this.tokens[this.index];
	}

	private eat(value: string): boolean {
		const token = this.peek();
		if (token && token.type === "punct" && token.value === value) {
			this.index += 1;
			return true;
		}
		return false;
	}

	private parseExpression(): Node {
		let left = this.parseTerm();
		for (;;) {
			const token = this.peek();
			if (token && token.type === "punct" && (token.value === "+" || token.value === "-")) {
				this.index += 1;
				const right = this.parseTerm();
				left = { kind: "binary", op: token.value as "+" | "-", left, right };
				continue;
			}
			return left;
		}
	}

	private parseTerm(): Node {
		let left = this.parseFactor();
		for (;;) {
			const token = this.peek();
			if (token && token.type === "punct" && (token.value === "*" || token.value === "/")) {
				this.index += 1;
				const right = this.parseFactor();
				left = { kind: "binary", op: token.value as "*" | "/", left, right };
				continue;
			}
			return left;
		}
	}

	private parseFactor(): Node {
		const token = this.peek();
		if (!token) {
			throw new BalanceExpressionError("The expression ended unexpectedly.");
		}
		if (token.type === "punct" && token.value === "-") {
			this.index += 1;
			return { kind: "negate", operand: this.parseFactor() };
		}
		if (token.type === "punct" && token.value === "+") {
			this.index += 1;
			return this.parseFactor();
		}
		if (token.type === "punct" && token.value === "(") {
			this.index += 1;
			const node = this.parseExpression();
			if (!this.eat(")")) {
				throw new BalanceExpressionError(`Missing ")" for the group starting at position ${token.at}.`);
			}
			return node;
		}
		if (token.type === "number") {
			this.index += 1;
			return { kind: "number", value: Number(token.value) };
		}
		if (token.type === "string") {
			this.index += 1;
			return { kind: "string", value: token.value };
		}
		if (token.type === "ident" || (token.type === "punct" && token.value === "[")) {
			return this.parsePath();
		}
		throw new BalanceExpressionError(`Unexpected "${token.value}" at position ${token.at}.`);
	}

	private parsePath(): Node {
		const segments: PathSegment[] = [];
		const first = this.peek();
		if (first && first.type === "ident") {
			this.index += 1;
			segments.push(first.value);
		}

		for (;;) {
			if (this.eat(".")) {
				const token = this.peek();
				if (!token || (token.type !== "ident" && token.type !== "number")) {
					throw new BalanceExpressionError(`Expected a field name after "." near position ${token?.at ?? "end"}.`);
				}
				this.index += 1;
				segments.push(token.value);
				continue;
			}
			if (this.eat("[")) {
				const token = this.peek();
				if (!token) {
					throw new BalanceExpressionError('Missing "]" at the end of the expression.');
				}
				if (token.type === "number") {
					this.index += 1;
					segments.push(Number(token.value));
				} else if (token.type === "string") {
					this.index += 1;
					segments.push(token.value);
				} else if (token.type === "ident") {
					this.index += 1;
					segments.push(this.parseSelector(token));
				} else {
					throw new BalanceExpressionError(`Expected an index, key, or field selector at position ${token.at}.`);
				}
				if (!this.eat("]")) {
					throw new BalanceExpressionError(`Missing "]" for the index starting at position ${token.at}.`);
				}
				continue;
			}
			if (!segments.length) {
				throw new BalanceExpressionError("Expected a field name.");
			}
			return { kind: "path", segments };
		}
	}

	/**
	 * Parse a `[...]` selector, whose field name has already been consumed.
	 *
	 * `limits[unit == 3]` picks the first element whose `unit` is 3. Coding-plan
	 * endpoints return their usage windows in an array whose order is not stable,
	 * so addressing a window by field is the only reliable way to read one.
	 */
	private parseSelector(field: Token): PathSelector {
		const operator = this.peek();
		if (!operator || operator.type !== "punct" || (operator.value !== "==" && operator.value !== "!=")) {
			throw new BalanceExpressionError(
				`Expected "==" or "!=" after "${field.value}" near position ${operator?.at ?? "end"}. ` +
					`Write [${field.value} == <value>] to pick an array element by field.`
			);
		}
		this.index += 1;
		const literal = this.peek();
		if (!literal || (literal.type !== "number" && literal.type !== "string")) {
			throw new BalanceExpressionError(
				`Expected a number or a quoted string after "${operator.value}" near position ${literal?.at ?? "end"}.`
			);
		}
		this.index += 1;
		return {
			field: field.value,
			value: literal.type === "number" ? Number(literal.value) : literal.value,
			negate: operator.value === "!=",
		};
	}
}

/**
 * Parse an expression. Throws `BalanceExpressionError` when the syntax is
 * invalid, so callers can show a precise message instead of failing silently.
 */
export function parseBalanceExpression(source: string): Node {
	const trimmed = source.trim();
	if (!trimmed) {
		throw new BalanceExpressionError("The expression is empty.");
	}
	return new Parser(tokenize(trimmed)).parse();
}

/**
 * Compare an array element's field with the selector value.
 *
 * Both sides are stringified so `3` matches `"3"`: providers are inconsistent
 * about whether an enum-like field is serialised as a number or a string.
 */
function matchesSelector(element: unknown, selector: PathSelector): boolean {
	if (element === null || typeof element !== "object") {
		return false;
	}
	const actual = (element as Record<string, unknown>)[selector.field];
	if (actual === undefined || actual === null) {
		return false;
	}
	const equal = String(actual) === String(selector.value);
	return selector.negate ? !equal : equal;
}

function walkPath(source: unknown, segments: ReadonlyArray<PathSegment>): unknown {
	let current: unknown = source;
	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		if (current === null || current === undefined) {
			return undefined;
		}
		if (typeof segment === "object") {
			if (!Array.isArray(current)) {
				return undefined;
			}
			// Consecutive selectors narrow the same array, so `limits[a == 1][b == 2]`
			// picks the element that matches both.
			const selectors: PathSelector[] = [segment];
			while (index + 1 < segments.length && typeof segments[index + 1] === "object") {
				index += 1;
				selectors.push(segments[index] as PathSelector);
			}
			current = current.find((element) => selectors.every((selector) => matchesSelector(element, selector)));
			continue;
		}
		if (typeof segment === "number") {
			if (!Array.isArray(current)) {
				return undefined;
			}
			current = current[segment];
			continue;
		}
		if (typeof current !== "object") {
			return undefined;
		}
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

/**
 * Turn a leaf value into a number. Numeric strings are accepted because some
 * providers serialize amounts as strings.
 */
function toNumber(value: unknown): number | undefined {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : undefined;
	}
	if (typeof value === "string") {
		const parsed = Number(value.trim());
		return value.trim() !== "" && Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function evaluate(node: Node, source: unknown): unknown {
	switch (node.kind) {
		case "number":
			return node.value;
		case "string":
			return node.value;
		case "path":
			return walkPath(source, node.segments);
		case "negate": {
			const operand = evaluate(node.operand, source);
			const value = toNumber(operand);
			return value === undefined ? undefined : -value;
		}
		case "binary": {
			const left = toNumber(evaluate(node.left, source));
			const right = toNumber(evaluate(node.right, source));
			if (left === undefined || right === undefined) {
				return undefined;
			}
			switch (node.op) {
				case "+":
					return left + right;
				case "-":
					return left - right;
				case "*":
					return left * right;
				case "/":
					if (right === 0) {
						throw new BalanceExpressionError("The expression divides by zero.");
					}
					return left / right;
			}
		}
	}
}

/**
 * Evaluate an expression to a number.
 *
 * Returns `undefined` when a referenced field is missing or is not numeric, so
 * the caller can tell "the provider did not report this" apart from a real
 * zero balance.
 */
export function evaluateBalanceNumber(source: string, response: unknown): number | undefined {
	return toNumber(evaluate(parseBalanceExpression(source), response));
}

/**
 * Evaluate an expression to text.
 *
 * A bare word such as `USD` parses as a field path and resolves to nothing, so
 * it is treated as a literal. That keeps the common case — typing a currency
 * code — working without forcing quotes.
 */
export function evaluateBalanceText(source: string, response: unknown): string | undefined {
	const value = evaluate(parseBalanceExpression(source), response);
	if (typeof value === "string") {
		return value.trim() || undefined;
	}
	if (typeof value === "number") {
		return String(value);
	}
	if (value === undefined || value === null) {
		const trimmed = source.trim();
		// `USD`, `CNY`, `次` — a plain label, not a path lookup.
		if (!/[.[\]()+\-*/]/.test(trimmed)) {
			return trimmed || undefined;
		}
		return undefined;
	}
	return undefined;
}
