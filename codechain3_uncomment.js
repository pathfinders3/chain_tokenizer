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
     * JavaScript 코드에서 주석을 제거합니다 (여러 줄 주석은 백틱 문자열로 변환, 줄 구조 유지)
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

        try {
            // Esprima로 코드 파싱 (주석 포함)
            var tokens = esprima.tokenize(sourceCode, { 
                range: true,
                comment: false
            });

            var comments = [];
            try {
                esprima.tokenize(sourceCode, {
                    range: true,
                    comment: true,
                    tolerant: true
                }, function(node, meta) {
                    // 주석 콜백
                });
                
                // 주석 정보 추출
                var parsed = esprima.parseScript(sourceCode, {
                    range: true,
                    comment: true,
                    tolerant: true
                });
                comments = parsed.comments || [];
            } catch (e) {
                // 주석 파싱 실패 시 무시
                console.warn('주석 파싱 실패:', e);
            }

            // 주석 위치를 맵으로 저장
            var commentMap = {};
            comments.forEach(function(comment) {
                for (var i = comment.range[0]; i < comment.range[1]; i++) {
                    commentMap[i] = comment;
                }
            });

            var result = '';
            var lastEnd = 0;
            var processedComments = new Set();

            tokens.forEach(function(token) {
                var start = token.range[0];
                var end = token.range[1];
                
                // 토큰 사이의 공백 및 주석 처리
                if (start > lastEnd) {
                    var between = sourceCode.substring(lastEnd, start);
                    var processed = '';
                    
                    for (var i = lastEnd; i < start; i++) {
                        var char = sourceCode[i];
                        var comment = commentMap[i];
                        
                        if (comment && !processedComments.has(comment)) {
                            processedComments.add(comment);
                            
                            // 여러 줄 주석인 경우 백틱 문자열로 변환
                            if (comment.type === 'Block') {
                                var commentText = sourceCode.substring(comment.range[0], comment.range[1]);
                                // /* */ 제거하고 내용만 추출
                                var content = commentText.substring(2, commentText.length - 2);
                                // 특수 문자를 다른 문자로 치환
                                content = content.replace(/'/g, '*');        // 작은따옴표 → *
                                content = content.replace(/"/g, '*');        // 큰따옴표 → *
                                content = content.replace(/\\/g, '*');       // 백슬래시 → *
                                content = content.replace(/`/g, '*');        // 백틱 → *
                                content = content.replace(/\$\{/g, 'S{');    // ${ → S{
                                processed += '`**' + content + '**`';
                                i = comment.range[1] - 1;
                            } else {
                                // 한 줄 주석은 삭제
                                i = comment.range[1] - 1;
                            }
                        } else if (!commentMap[i]) {
                            // 주석이 아닌 공백/줄바꿈은 유지
                            if (char === '\n' || char === ' ' || char === '\t' || char === '\r') {
                                processed += char;
                            }
                        }
                    }
                    
                    result += processed;
                }
                
                // 실제 토큰 추가 (문자열 토큰인 경우 슬래시/백슬래시 치환)
                var tokenValue = sourceCode.substring(start, end);
                if (token.type === 'String' || token.type === 'Template') {
                    tokenValue = replaceSlashesInQuotes(tokenValue);
                }
                result += tokenValue;
                lastEnd = end;
            });

            // 마지막 토큰 이후의 공백/줄바꿈 및 주석 처리
            if (lastEnd < sourceCode.length) {
                var remaining = sourceCode.substring(lastEnd);
                var processed = '';
                
                for (var i = lastEnd; i < sourceCode.length; i++) {
                    var char = sourceCode[i];
                    var comment = commentMap[i];
                    
                    if (comment && !processedComments.has(comment)) {
                        processedComments.add(comment);
                        
                        if (comment.type === 'Block') {
                            var commentText = sourceCode.substring(comment.range[0], comment.range[1]);
                            var content = commentText.substring(2, commentText.length - 2);
                            content = content.replace(/'/g, '*');
                            content = content.replace(/"/g, '*');
                            content = content.replace(/\\/g, '*');
                            content = content.replace(/`/g, '*');
                            content = content.replace(/\$\{/g, 'S{');
                            processed += '`**' + content + '**`';
                            i = comment.range[1] - 1;
                        } else {
                            i = comment.range[1] - 1;
                        }
                    } else if (!commentMap[i]) {
                        if (char === '\n' || char === ' ' || char === '\t' || char === '\r') {
                            processed += char;
                        }
                    }
                }
                
                result += processed;
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