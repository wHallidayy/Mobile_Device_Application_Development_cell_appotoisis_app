/**
 * Validation utilities for the application
 */

export const validateFolderName = (name: string): { isValid: boolean; error?: string } => {
                    const trimmed = name.trim();

                    // 1. Check if empty or just spaces
                    if (!trimmed) {
                                        return { isValid: false, error: 'Folder name cannot be empty or just whitespace' };
                    }

                    // 2. Check max length (255 chars)
                    // Note: JS string length is UTF-16 code units, but close enough for simple length check.
                    // For strict 255 chars count, we can use [...name].length but name.length is usually fine for max limit.
                    if (name.length > 255) {
                                        return { isValid: false, error: 'Folder name must not exceed 255 characters' };
                    }

                    // 3. Check for Null byte
                    if (name.includes('\0')) {
                                        return { isValid: false, error: 'Folder name cannot contain null bytes' };
                    }

                    // 4. Check for Path Traversal
                    if (name.includes('../') || name.includes('./')) {
                                        return { isValid: false, error: 'Folder name cannot contain path traversal patterns' };
                    }

                    // 5. Check for Emojis
                    // Regex covering common emoji ranges (Surrogate pairs for U+1Fxxx and basic ranges)
                    // U+1F600-U+1F64F (Emoticons) -> \uD83D[\uDE00-\uDE4F]
                    // U+1F300-U+1F5FF (Misc Symbols) -> \uD83C[\uDF00-\uDFFF] | \uD83D[\uDC00-\uDDFF] (approx)
                    // U+1F680-U+1F6FF (Transport) -> \uD83D[\uDE80-\uDEFF]
                    // U+1F900-U+1F9FF (Supplemental) -> \uD83E[\uDD00-\uDDFF]
                    // U+2600-U+26FF (Misc symbols) -> \u2600-\u26FF
                    // U+2700-U+27BF (Dingbats) -> \u2700-\u27BF
                    const emojiRegex = /(\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F]|\uD83D[\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF]|\u2600-\u26FF|\u2700-\u27BF)/;

                    if (emojiRegex.test(name)) {
                                        return { isValid: false, error: 'Folder name cannot contain emojis' };
                    }

                    return { isValid: true };
};
