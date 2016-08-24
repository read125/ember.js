var tokenize = require('simple-html-tokenizer');

function generateTokens(containerOrHTML) {
  if (typeof containerOrHTML === 'string') {
    return {
      tokens: tokenize(containerOrHTML),
      html: containerOrHTML
    };
  } else {
    return {
      tokens: tokenize(containerOrHTML.innerHTML),
      html: containerOrHTML.innerHTML
    };
  }
}

function normalizeTokens(tokens) {
  tokens.forEach(token => {
    if (token.type === 'StartTag') {
      token.attributes = token.attributes.sort(function(a, b) {
        if (a[0] > b[0]) { return 1; }
        if (a[0] < b[0]) { return -1; }
        return 0;
      });
    }
  });
}

function equalTokens(actualContainer, expectedHTML, message) {
  var actual = generateTokens(actualContainer);
  var expected = generateTokens(expectedHTML);

  normalizeTokens(actual.tokens);
  normalizeTokens(expected.tokens);

  var equiv = QUnit.equiv(actual.tokens, expected.tokens);

  if (equiv && expected.html !== actual.html) {
    deepEqual(actual.tokens, expected.tokens, message);
  } else {
    QUnit.push(QUnit.equiv(actual.tokens, expected.tokens), actual.html, expected.html, message);
  }
}

module.exports = {
  equalTokens: equalTokens
};
