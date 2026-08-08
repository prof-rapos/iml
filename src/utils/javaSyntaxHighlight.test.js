import { describe, it, expect } from 'vitest';
import { tokenizeJavaLine, initJavaHighlightState, JAVA_TOKEN_COLORS } from './javaSyntaxHighlight';

describe('tokenizeJavaLine', () => {
  it('colors a keyword, a class-name identifier, a string, and a comment on one line', () => {
    const { tokens, state } = tokenizeJavaLine('public String name = "Bob"; // greet', initJavaHighlightState());
    const byText = Object.fromEntries(tokens.map((t) => [t.text, t.color]));
    expect(byText['public']).toBe(JAVA_TOKEN_COLORS.keyword);
    // "String" isn't a reserved word (just a regular class-name identifier),
    // so it gets the same default color as any other non-keyword identifier.
    expect(byText['String']).toBe(JAVA_TOKEN_COLORS.default);
    expect(byText['name']).toBe(JAVA_TOKEN_COLORS.default);
    expect(byText['"Bob"']).toBe(JAVA_TOKEN_COLORS.string);
    expect(byText['// greet']).toBe(JAVA_TOKEN_COLORS.comment);
    expect(state.inBlockComment).toBe(false);
  });

  it('colors a numeric literal', () => {
    const { tokens } = tokenizeJavaLine('int x = 42;', initJavaHighlightState());
    const numberToken = tokens.find((t) => t.text === '42');
    expect(numberToken.color).toBe(JAVA_TOKEN_COLORS.number);
  });

  it('carries block-comment state across lines', () => {
    const first = tokenizeJavaLine('/* starts here', initJavaHighlightState());
    expect(first.state.inBlockComment).toBe(true);
    expect(first.tokens.every((t) => t.color === JAVA_TOKEN_COLORS.comment)).toBe(true);

    const second = tokenizeJavaLine('still a comment', first.state);
    expect(second.state.inBlockComment).toBe(true);
    expect(second.tokens).toEqual([{ text: 'still a comment', color: JAVA_TOKEN_COLORS.comment }]);

    const third = tokenizeJavaLine('ends here */ int y = 1;', second.state);
    expect(third.state.inBlockComment).toBe(false);
    const byText = Object.fromEntries(third.tokens.map((t) => [t.text, t.color]));
    expect(byText['int']).toBe(JAVA_TOKEN_COLORS.keyword);
  });

  it('closes a block comment opened and closed on the same line', () => {
    const { tokens, state } = tokenizeJavaLine('/* inline */ int z;', initJavaHighlightState());
    expect(state.inBlockComment).toBe(false);
    expect(tokens[0]).toEqual({ text: '/* inline */', color: JAVA_TOKEN_COLORS.comment });
  });
});
