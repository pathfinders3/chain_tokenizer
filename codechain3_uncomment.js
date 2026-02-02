/**
 * JavaScript Comment Remover
 * Esprima 기반 주석 제거 유틸리티
 * 
 * 사용법:
 * 1. HTML에 Esprima CDN 포함:
 *    <script src="https://cdnjs.cloudflare.com/ajax/libs/esprima/4.0.1/esprima.min.js"></script>
 * 2. 이 파일 포함:
 *    <script src="comment-remover.js"></script>
 * 3. CommentRemover.remove(sourceCode) 호출
 */

var CommentRemover = (function() {
    'use strict';

    /**
     * 인용부호 내의 슬래시와 백슬래시를 별표로 치환합니다
     * @param {string} str - 처리할 문자열
     * @returns {string} 치환된 문자열
     */
    function replaceSlashesInQuotes(str) {
        var result = '';
        var inSingleQuote = false;
        var inDoubleQuote = false;
        var inTemplateString = false;
        var escaped = false;
        
        for (var i = 0; i < str.length; i++) {
            var char = str[i];
            var prevChar = i > 0 ? str[i - 1] : '';
            
            // 이스케이프 처리
            if (escaped) {
                result += char;
                escaped = false;
                continue;
            }
            
            if (char === '\\') {
                escaped = true;
                // 인용부호 안에서는 백슬래시를 별표로 치환
                if (inSingleQuote || inDoubleQuote || inTemplateString) {
                    result += '*';
                } else {
                    result += char;
                }
                continue;
            }
            
            // 인용부호 상태 토글
            if (char === "'" && !inDoubleQuote && !inTemplateString) {
                inSingleQuote = !inSingleQuote;
                result += char;
            } else if (char === '"' && !inSingleQuote && !inTemplateString) {
                inDoubleQuote = !inDoubleQuote;
                result += char;
            } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
                inTemplateString = !inTemplateString;
                result += char;
            } else if (char === '/' && (inSingleQuote || inDoubleQuote || inTemplateString)) {
                // 인용부호 안에서 슬래시를 별표로 치환
                result += '*';
            } else {
                result += char;
            }
        }
        
        return result;
    }

    /**
     * JavaScript 코드에서 주석을 제거합니다 (줄 구조 유지)
     * @param {string} sourceCode - 원본 JavaScript 코드
     * @returns {string} 주석이 제거된 코드
     * @throws {Error} 파싱 오류 발생 시
     */
    function removeComments(sourceCode) {
        if (typeof esprima === 'undefined') {
            throw new Error('Esprima 라이브러리가 로드되지 않았습니다. CDN을 먼저 포함해주세요.');
        }

        if (!sourceCode || typeof sourceCode !== 'string') {
            throw new Error('유효한 문자열을 입력해주세요.');
        }

        try {
            // Esprima로 코드 파싱 (주석 제외)
            var tokens = esprima.tokenize(sourceCode, { 
                range: true,
                comment: false
            });

            var result = '';
            var lastEnd = 0;

            tokens.forEach(function(token) {
                var start = token.range[0];
                var end = token.range[1];
                
                // 토큰 사이의 공백 처리 (줄바꿈 유지, 주석 내용만 제거)
                if (start > lastEnd) {
                    var between = sourceCode.substring(lastEnd, start);
                    // 줄바꿈과 공백은 유지, 다른 문자만 제거
                    var whitespace = between.replace(/[^\n\s]/g, '');
                    result += whitespace;
                }
                
                // 실제 토큰 추가 (문자열 토큰인 경우 슬래시/백슬래시 치환)
                var tokenValue = sourceCode.substring(start, end);
                if (token.type === 'String' || token.type === 'Template') {
                    tokenValue = replaceSlashesInQuotes(tokenValue);
                }
                result += tokenValue;
                lastEnd = end;
            });

            // 마지막 토큰 이후의 공백/줄바꿈 처리
            if (lastEnd < sourceCode.length) {
                var remaining = sourceCode.substring(lastEnd);
                result += remaining.replace(/[^\n\s]/g, '');
            }

            return result;

        } catch (error) {
            throw new Error('파싱 오류: ' + error.message);
        }
    }

    /**
     * 파일에서 주석을 제거합니다 (File API 사용)
     * @param {File} file - JavaScript 파일 객체
     * @returns {Promise<string>} 주석이 제거된 코드
     */
    function removeCommentsFromFile(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            
            reader.onload = function(e) {
                try {
                    var result = removeComments(e.target.result);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = function() {
                reject(new Error('파일 읽기 실패'));
            };
            
            reader.readAsText(file);
        });
    }

    // Public API
    return {
        remove: removeComments,
        removeFromFile: removeCommentsFromFile,
        version: '1.0.0'
    };
})();

// Node.js 환경 지원 (선택사항)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CommentRemover;
}