/**
 * Utility functions for sanitizing LLM responses
 */

/**
 * Removes markdown code blocks from a JSON response string.
 * Handles both ```json and ``` code block formats.
 * 
 * @param response - The raw response string that may contain markdown code blocks
 * @returns The cleaned response string with markdown code blocks removed
 * 
 * @example
 * ```typescript
 * const raw = "```json\n{\"key\": \"value\"}\n```";
 * const cleaned = sanitizeJsonResponse(raw);
 * // Returns: '{"key": "value"}'
 * ```
 */
export function sanitizeJsonResponse(response: string): string {
    let cleaned = response.trim();
    
    // Remove markdown code blocks if present
    if (cleaned.startsWith('```json') || cleaned.startsWith('```')) {
        cleaned = cleaned
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .trim();
    }
    
    return cleaned;
}

/**
 * Removes markdown code blocks from a markdown response string.
 * Handles ```markdown, ```md, and ``` formats.
 * 
 * @param response - The raw markdown response that may contain code block wrappers
 * @returns The cleaned markdown string with code block wrappers removed
 * 
 * @example
 * ```typescript
 * const raw = "```markdown\n# Title\n```";
 * const cleaned = sanitizeMarkdownResponse(raw);
 * // Returns: '# Title'
 * ```
 */
export function sanitizeMarkdownResponse(response: string): string {
    let cleaned = response.trim();
    
    // Remove markdown code block wrappers if present
    if (cleaned.startsWith('```markdown') || cleaned.startsWith('```md')) {
        cleaned = cleaned
            .replace(/^```(markdown|md)\s*/g, '')
            .replace(/```\s*$/g, '')
            .trim();
    }
    
    return cleaned;
}

/**
 * Removes LaTeX/math notation from markdown text.
 * Replaces inline math ($...$), display math ($$...$$), and LaTeX notation.
 * 
 * @param text - The markdown text that may contain LaTeX notation
 * @returns The sanitized text with LaTeX notation removed
 * 
 * @example
 * ```typescript
 * const text = "The value is $x^2$ and $$\\sum_{i=1}^{n}$$";
 * const cleaned = sanitizeLatexNotation(text);
 * // Returns: 'The value is x^2 and \\sum_{i=1}^{n}'
 * ```
 */
export function sanitizeLatexNotation(text: string): string {
    return text
        .replace(/\$\$([^\$]+)\$\$/g, '$1')      // Display math $$...$$
        .replace(/\$([^\$]+)\$/g, '$1')           // Inline math $...$
        .replace(/\\\(([^)]+)\\\)/g, '$1')        // LaTeX inline \(...\)
        .replace(/\\\[([^\]]+)\\\]/g, '$1');       // LaTeX display \[...\]
}

/**
 * Sanitizes text content for storage (e.g., Redis).
 * Removes problematic Unicode characters, emojis, and high Unicode characters.
 * 
 * @param text - The text to sanitize
 * @returns The sanitized text safe for storage
 * 
 * @example
 * ```typescript
 * const text = "Hello 👋 World";
 * const sanitized = sanitizeForStorage(text);
 * // Returns: 'Hello  World' (emoji removed)
 * ```
 */
export function sanitizeForStorage(text: string): string {
    return text
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '') // Remove surrogate pairs (emojis and high Unicode)
        .normalize('NFD')                                 // Normalize to NFD form
        .replace(/[\u0300-\u036f]/g, '')                 // Remove combining diacritical marks
        .replace(/[^\x20-\x7E\u00A0-\u00FF\n\r\t]/g, '') // Keep printable ASCII + Latin-1 + whitespace
        .trim();
}

