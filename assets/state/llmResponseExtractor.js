'use strict';

(function attachLlmResponseExtractor(globalScope) {
  function coerceTextContent(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      const joined = value
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item.text === 'string') return item.text;
          if (item && typeof item.content === 'string') return item.content;
          return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
      return joined || null;
    }
    if (value && typeof value.text === 'string') return value.text;
    if (value && typeof value.content === 'string') return value.content;
    return null;
  }

  function describeLlmResponse(data = {}) {
    const choices = Array.isArray(data?.choices) ? data.choices : [];
    for (const choice of choices) {
      const directMessage = coerceTextContent(choice?.message?.content);
      if (directMessage) return {
        text: directMessage,
        diagnostic: 'assistant message content found'
      };

      const directOutput = coerceTextContent(choice?.content);
      if (directOutput) return {
        text: directOutput,
        diagnostic: 'choice content found'
      };

      const textField = coerceTextContent(choice?.text);
      if (textField) return {
        text: textField,
        diagnostic: 'choice text found'
      };

      const finishReason = String(choice?.finish_reason || '').trim();
      const messageKeys = choice?.message && typeof choice.message === 'object'
        ? Object.keys(choice.message).slice(0, 8).join(', ')
        : '';
      const choiceKeys = choice && typeof choice === 'object'
        ? Object.keys(choice).slice(0, 8).join(', ')
        : '';
      return {
        text: null,
        diagnostic: `choices[0] had no usable text${finishReason ? `; finish_reason: ${finishReason}` : ''}${messageKeys ? `; message keys: ${messageKeys}` : ''}${choiceKeys ? `; choice keys: ${choiceKeys}` : ''}`.trim()
      };
    }

    const outputText = coerceTextContent(data?.output_text);
    if (outputText) return {
      text: outputText,
      diagnostic: 'output_text found'
    };

    const responsesOutput = Array.isArray(data?.output) ? data.output : [];
    for (const item of responsesOutput) {
      const content = Array.isArray(item?.content) ? item.content : [];
      const joined = content
        .map((part) => coerceTextContent(part?.text || part))
        .filter(Boolean)
        .join('\n')
        .trim();
      if (joined) return {
        text: joined,
        diagnostic: 'responses output content found'
      };
    }

    const topKeys = Object.keys(data || {}).slice(0, 8).join(', ');
    return {
      text: null,
      diagnostic: `no supported content fields found; top-level keys: ${topKeys || '(none)'}`
    };
  }

  function extractLlmTextResponse(data = {}) {
    return describeLlmResponse(data).text;
  }

  const api = {
    coerceTextContent,
    describeLlmResponse,
    extractLlmTextResponse
  };

  Object.assign(globalScope, api);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
