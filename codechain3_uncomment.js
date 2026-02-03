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

    // 여러 줄 주석 저장용 전역 배열
    var multiLineComments = [];
    
    // 경고 메시지 저장용
    var warningMessages = [];

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
     * Helper: Esprima로 토큰과 주석을 파싱합니다
     */
    function parseSource(sourceCode) {
        var tokens = esprima.tokenize(sourceCode, { range: true, comment: false });
        var comments = [];
        try {
            var parsed = esprima.parseScript(sourceCode, {
                range: true,
                comment: true,
                tolerant: true,
                loc: true
            });
            comments = parsed.comments || [];
        } catch (e) {
            try {
                var parsed = esprima.parseModule(sourceCode, {
                    range: true,
                    comment: true,
                    tolerant: true,
                    loc: true
                });
                comments = parsed.comments || [];
            } catch (e2) {
                var warningMsg = '⚠️ 주석 파싱 실패 (Script 및 Module 모두): ' + e2.message;

                if (e2.lineNumber) {
                    warningMsg += '\n위치: ' + e2.lineNumber + '줄';
                    var lines = sourceCode.split('\n');
                    if (e2.lineNumber > 0 && e2.lineNumber <= lines.length) {
                        var errorLine = lines[e2.lineNumber - 1];
                        var preview = errorLine.trim();
                        if (preview.length > 80) {
                            preview = preview.substring(0, 77) + '...';
                        }
                        warningMsg += '\n코드: ' + preview;
                        if (e2.column !== undefined) {
                            warningMsg += '\n       ' + ' '.repeat(Math.min(e2.column, 80)) + '^';
                        }
                    }
                } else if (e2.index !== undefined) {
                    var beforeError = sourceCode.substring(0, e2.index);
                    var lineNum = (beforeError.match(/\n/g) || []).length + 1;
                    warningMsg += '\n위치: ' + lineNum + '줄 (문자 위치 ' + e2.index + ')';
                    var lines = sourceCode.split('\n');
                    if (lineNum > 0 && lineNum <= lines.length) {
                        var errorLine = lines[lineNum - 1];
                        var preview = errorLine.trim();
                        if (preview.length > 80) {
                            preview = preview.substring(0, 77) + '...';
                        }
                        warningMsg += '\n코드: ' + preview;
                    }
                }

                console.warn(warningMsg, e2);
                warningMessages.push(warningMsg);
                comments = [];
            }
        }
        return {
            tokens: tokens,
            comments: comments
        };
    }

    /**
     * Helper: 주석 위치를 맵으로 만듭니다
     */
    function buildCommentMap(comments) {
        var map = {};
        comments.forEach(function(comment) {
            for (var i = comment.range[0]; i < comment.range[1]; i++) {
                map[i] = comment;
            }
        });
        return map;
    }

    /**
     * Helper: 여러줄 주석을 저장하고 인덱스를 반환합니다
     */
    function addMultiLineComment(content, comment) {
        var index = multiLineComments.length;
        multiLineComments.push({
            content: content,
            startLine: comment.loc.start.line,
            endLine: comment.loc.end.line
        });
        return index;
    }

    /**
     * Helper: 토큰 사이의 영역(공백/주석)을 처리합니다
     */
    function processBetween(source, from, to, commentMap, processedComments) {
        var processed = '';
        var i = from;
        while (i < to) {
            var char = source[i];
            var comment = commentMap[i];

            if (comment && !processedComments.has(comment)) {
                processedComments.add(comment);

                if (comment.type === 'Block') {
                    var commentText = source.substring(comment.range[0], comment.range[1]);
                    var content = commentText.substring(2, commentText.length - 2);

                    if (content.indexOf('\n') !== -1) {
                        var index = addMultiLineComment(content, comment);
                        var placeholder = '`** multi-' + String(index + 1).padStart(3, '0') + ' **`';
                        processed += placeholder;
                    }
                    i = comment.range[1];
                } else {
                    i = comment.range[1];
                }
            } else if (!commentMap[i]) {
                if (char === '\n' || char === ' ' || char === '\t' || char === '\r') {
                    processed += char;
                }
                i++;
            } else {
                i++;
            }
        }
        return processed;
    }

    /**
     * Helper: 토큰을 변환합니다
     */
    function transformTokenValue(token, source) {
        var tokenValue = source.substring(token.range[0], token.range[1]);
        if (token.type === 'String' || token.type === 'Template') {
            return replaceSlashesInQuotes(tokenValue);
        } else if (token.type === 'RegularExpression') {
            return tokenValue.replace(/\//g, '|');
        }
        return tokenValue;
    }

    /**
     * JavaScript 코드에서 주석을 제거합니다 (여러 줄 주석은 multi-NNN 형식으로 치환, 줄 구조 유지)
     * @param {string} sourceCode - 원본 JavaScript 코드
     * @returns {string} 주석이 제거/변환된 코드
     * @throws {Error} 파싱 오류 발생 시
     */
    function removeComments(sourceCode) {
        if (typeof esprima === 'undefined') {
            throw new Error('Esprima 라이브러리가 로드되지 않았습니다. CDN을 먼저 포함해주세요.');
        }

        if (!sourceCode || typeof sourceCode !== 'string') {
            throw new Error('유효한 문자열을 입력해주세요.');
        }

        // 배열 초기화
        multiLineComments = [];
        warningMessages = [];

        try {
            var parsed = parseSource(sourceCode);
            var tokens = parsed.tokens;
            var comments = parsed.comments || [];

            // 주석 위치를 맵으로 저장
            var commentMap = buildCommentMap(comments);

            var result = '';
            var lastEnd = 0;
            var processedComments = new Set();

            tokens.forEach(function(token) {
                var start = token.range[0];
                var end = token.range[1];
                
                // 토큰 사이의 공백 및 주석 처리
                if (start > lastEnd) {
                    result += processBetween(sourceCode, lastEnd, start, commentMap, processedComments);
                }
                
                // 토큰 변환 처리
                result += transformTokenValue(token, sourceCode);
                lastEnd = end;
            });

            // 마지막 토큰 이후의 공백/줄바꿈 및 주석 처리
            if (lastEnd < sourceCode.length) {
                result += processBetween(sourceCode, lastEnd, sourceCode.length, commentMap, processedComments);
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
        getMultiLineComments: function() {
            return multiLineComments;
        },
        getMultiLineComment: function(index) {
            return multiLineComments[index] || null;
        },
        getWarnings: function() {
            return warningMessages;
        },
        version: '1.0.0'
    };
})();

// Node.js 환경 지원 (선택사항)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CommentRemover;
}