function tokenize(source) {
      const tokens = [];
      let i = 0, line = 1, col = 1;
      let canRegex = true;
      let start, startLine, startCol;
      const add = (type, end = i) => {
        tokens.push({
          type,
          value: source.slice(start, end),
          loc: { start: { line: startLine, col: startCol }, end: { line, col } }
        });
      };
      while (i < source.length) {
        let ch = source[i];
        start = i; startLine = line; startCol = col;
        
        if (/\s/.test(ch)) {
          if (ch === '\n') { line++; col = 1; } else col++;
          i++;
          continue;
        }
        
        if (ch === '/' && source[i + 1] === '/') {
          i = source.indexOf('\n', i + 2);
          if (i === -1) i = source.length;
          add('LineComment');
          continue;
        }
        
        if (ch === '/' && source[i + 1] === '*') {
          i = source.indexOf('*/', i + 2);
          if (i !== -1) i += 2; else i = source.length;
          add('BlockComment');
          continue;
        }
        
        if ("`'\"".includes(ch)) {
          const quote = ch;
          i++;
          while (i < source.length && source[i] !== quote) {
            if (source[i] === '\\') i++;
            i++;
          }
          if (i < source.length) i++;
          add(quote === '`' ? 'Template' : 'String');
          canRegex = false;
          continue;
        }
        
        if (ch === '/') {
          if (canRegex) {
            let pos = i + 1, inClass = false;
            while (pos < source.length) {
              if (source[pos] === '\\') pos += 2;
              else if (source[pos] === '[') inClass = true;
              else if (source[pos] === ']') inClass = false;
              else if (source[pos] === '/' && !inClass) break;
              else pos++;
            }
            let flagPos = pos + 1;
            while (/[gimsuy]/.test(source[flagPos])) flagPos++;
            if (pos < source.length && source[pos] === '/' && (flagPos === source.length || !/[a-zA-Z0-9_$]/.test(source[flagPos]))) {
              add('RegExp', flagPos);
              i = flagPos;
              canRegex = false;
              continue;
            }
          }
          const value = source[i + 1] === '=' ? '/=' : '/';
          i += value.length;
          add('Punctuator', i);
          canRegex = true;
          continue;
        }
        
        if (/[a-zA-Z_$]/.test(ch)) {
          while (/[a-zA-Z0-9_$]/.test(source[i])) i++;
          const word = source.slice(start, i);
          const isKeyword = /^(return|yield|await|throw|typeof|void|delete|new|instanceof|in|of|this|function|class|extends|var|let|const|if|else)$/.test(word);
          add(isKeyword ? 'Keyword' : 'Identifier');
          canRegex = !isKeyword;
          continue;
        }
        
        if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1]))) {
          while (/[0-9a-fA-Fxob.ef+-]/.test(source[i])) i++;
          add('Numeric');
          canRegex = false;
          continue;
        }
        
        const rest = source.slice(i);
        const match = rest.match(/^(=>|\?\?|\?\.|>>>?|<<=|>>=|===?|!==?|[-+*/%&|^!=<>]=?|\*\*|&&|\|\||\?\?=)/);
        if (match) {
          i += match[0].length;
          add('Punctuator', i);
        } else {
          i++;
          add('Punctuator', i);
        }
        
        if ("([{".includes(ch)) canRegex = true;
        if (")]}".includes(ch) || ['Identifier','Numeric','String','Template','RegExp'].includes(tokens.at(-1)?.type)) {
          canRegex = false;
        }
        if (tokens.at(-1)?.type === 'Punctuator' && !'.,;'.includes(ch)) {
          canRegex = true;
        }
        col += i - start;
      }
      return tokens;
    }

    function analyze() {
      const input = document.getElementById('input').value;
      const output = document.getElementById('output');
      
      try {
        const tokens = tokenize(input);
        
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
    analyze();
