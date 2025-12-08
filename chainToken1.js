function tokenizeWithRanges(source) {
  const tokens = [];
  let i = 0, line = 1, col = 1;
  let canRegex = true;
  let braceDepth = 0;
  const braceStack = [];  // { 가 열릴 때마다 위치 저장

  // ⬇⬇⬇ start/startLine/startCol 을 인자로 받도록 수정
  const add = (type, end, startInfo) => {
    const { start, startLine, startCol } = startInfo;

    const token = {
      type,
      value: source.slice(start, end),
      range: [start, end],
      loc: {
        start: { line: startLine, col: startCol },
        end: { line, col }
      }
    };
    tokens.push(token);
    return token;
  };

  while (i < source.length) {
    let ch = source[i];
    const start = i, startLine = line, startCol = col;
    const startInfo = { start, startLine, startCol };

    // 공백 처리
    if (/\s/.test(ch)) {
      if (ch === '\n') {
        i++;
        line++;
        col = 1;
      } else {
        i++;
        col++;
      }
      continue;
    }

    // 한 줄 주석 //
    if (ch === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i + 2);
      if (i === -1) i = source.length;
      add('LineComment', i, startInfo);
      continue;
    }

    // 블록 주석 /* ... */
    if (ch === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2);
      if (i !== -1) i += 2;
      else i = source.length;
      add('BlockComment', i, startInfo);
      continue;
    }

    // 문자열 / 템플릿 문자열
    if ("`'\"".includes(ch)) {
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i++;
        i++;
      }
      if (i < source.length) i++;
      add(quote === '`' ? 'Template' : 'String', i, startInfo);
      canRegex = false;
      continue;
    }

    // /, /=, 정규식 리터럴
    if (ch === '/') {
      if (canRegex) {
        let pos = i + 1, inClass = false;
        while (pos < source.length && (inClass || source[pos] !== '/')) {
          if (source[pos] === '\\') pos += 2;
          else if (source[pos] === '[') inClass = true;
          else if (source[pos] === ']') inClass = false;
          else pos++;
        }
        let flagPos = pos + 1;
        while (/[gimsuy]/.test(source[flagPos])) flagPos++;
        if (
          pos < source.length &&
          (flagPos === source.length || !/[a-zA-Z0-9_$]/.test(source[flagPos]))
        ) {
          add('RegExp', flagPos, startInfo);
          i = flagPos;
          canRegex = false;
          continue;
        }
      }
      const value = source[i + 1] === '=' ? '/=' : '/';
      i += value.length;
      add('Punctuator', i, startInfo);
      canRegex = true;
      continue;
    }

    // === 중괄호 처리 시작 ===
    if (ch === '{') {
      braceStack.push({ start, depth: braceDepth++, token: null });
      i++;
      add('Punctuator', i, startInfo);
      continue;
    }

    if (ch === '}') {
      i++;
      const open = braceStack.pop();
      if (open) {
        const token = add('Punctuator', i, startInfo);
        token.blockRange = [open.start, i];
        token.blockDepth = open.depth;
      }
      braceDepth--;
      continue;
    }
    // === 중괄호 처리 끝 ===

    // 식별자 / 키워드
    if (/[a-zA-Z_$]/.test(ch)) {
      while (/[a-zA-Z0-9_$]/.test(source[i])) i++;
      const word = source.slice(start, i);
      const isBlockKeyword = /^(function|class|if|while|for|switch)$/.test(word);
      add(isBlockKeyword ? 'BlockKeyword' : 'Identifier', i, startInfo);
      canRegex = false;
      continue;
    }

    // 숫자
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1]))) {
      while (/[0-9a-fA-Fxob.ef+-]/.test(source[i])) i++;
      add('Numeric', i, startInfo);
      canRegex = false;
      continue;
    }

    // 그 외 punctuator (연산자 등)
    const rest = source.slice(i);
    const match = rest.match(
      /^(=>|\?\?|\?\.|>>>?|<<=|>>=|===?|!==?|[-+*/%&|^!=<>]=?|\*\*|&&|\|\||\?\?=)/
    );
    i += match ? match[0].length : 1;
    add('Punctuator', i, startInfo);

    if ("([{".includes(ch)) canRegex = true;
    if (")]}".includes(ch) || ['Identifier','Numeric','String','Template','RegExp'].includes(tokens.at(-1)?.type)) {
      canRegex = false;
    }

    // (원래 코드에 있던 부분) 이 경우에만 col 업데이트
    col += i - start;
  }

  return tokens;
}


    function analyze() {
      const input = document.getElementById('input').value;
      const output = document.getElementById('output');
      
      try {
        const tokens = tokenizeWithRanges(input);
        
        const counts = {
          total: tokens.length,
          Keyword: 0,
          Identifier: 0,
          String: 0,
          Template: 0
        };
        
        tokens.forEach(t => {
          if (counts.hasOwnProperty(t.type)) counts[t.type]++;
        });
        
        document.getElementById('tokenCount').textContent = counts.total;
        document.getElementById('keywordCount').textContent = counts.Keyword;
        document.getElementById('identifierCount').textContent = counts.Identifier;
        document.getElementById('stringCount').textContent = counts.String + counts.Template;
        
        output.innerHTML = tokens.map((token, idx) => `
          <div class="token">
            <div>
              <span class="token-type">${token.type}</span>
              <span class="token-value">${escapeHtml(token.value)}</span>
            </div>
            <div class="token-loc">
              Line ${token.loc.start.line}:${token.loc.start.col} → ${token.loc.end.line}:${token.loc.end.col}
            </div>
          </div>
        `).join('');
        
      } catch (e) {
        output.innerHTML = `<div style="color: red; padding: 10px;">오류: ${e.message}</div>`;
      }
    }
    
    function escapeHtml(text) {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
      return text.replace(/[&<>"']/g, m => map[m]);
    }
    
    function clearAll() {
      document.getElementById('input').value = '';
      document.getElementById('output').innerHTML = '';
      document.getElementById('tokenCount').textContent = '0';
      document.getElementById('keywordCount').textContent = '0';
      document.getElementById('identifierCount').textContent = '0';
      document.getElementById('stringCount').textContent = '0';
    }
    
    function loadSample() {
      document.getElementById('input').value = `// 샘플 코드
function hello(name) {
  const greeting = \`Hello, \${name}!\`;
  return greeting;
}

const result = hello("World");
console.log(result);`;
      analyze();
    }
    
    // 초기 분석
    /* analyze(); */
