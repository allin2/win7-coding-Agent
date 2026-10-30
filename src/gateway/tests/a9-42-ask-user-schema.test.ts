import * as http from 'http';
import { OpenAICompatibleProvider } from '../src';

// Exercise the actual registered A9 tool, not a handwritten copy of its schema.
const { a9ToolSpecs } = require('../../core/dist/a9-tools');

describe('A9-42 ask_user JSON Schema on the Provider wire', () => {
  it('sends a standard array/items schema and preserves the six-option/200-character bounds', async () => {
    const tools = a9ToolSpecs('full_access', { office: true }).map((t: any) => ({ name: t.name, description: t.description, parameters: t.inputSchema }));
    const before = JSON.stringify(tools);
    let seen: any;
    const server = http.createServer((req, res) => {
      let raw = ''; req.on('data', (b: Buffer) => raw += b.toString('utf8'));
      req.on('end', () => {
        seen = JSON.parse(raw).tools.find((t: any) => t.function.name === 'ask_user').function.parameters;
        const options = seen.properties.options;
        if (seen.type !== 'object' || options.type !== 'array' || typeof options.items !== 'object') {
          res.writeHead(400); res.end('{"error":{"message":"Invalid schema for function ask_user: items must be a schema"}}'); return;
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"question","type":"function","function":{"name":"ask_user","arguments":"{\\"prompt\\":\\"选择风格\\",\\"options\\":[\\"简洁\\",\\"正式\\"]}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n');
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const provider = new OpenAICompatibleProvider({ baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, model: 'fixture' });
      const result = await provider.sendStreamRequest({ id: 'question', messages: [{ role: 'user', content: '先提问' }], tools }, () => {});
      expect(result.toolCalls?.[0].name).toBe('ask_user');
      expect(seen).toMatchObject({ type: 'object', required: ['prompt'], additionalProperties: false,
        properties: { prompt: { type: 'string', maxLength: 2000 },
          options: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 200 } } } });
      expect(seen.properties.options).not.toHaveProperty('maxLength');
      expect(JSON.stringify(tools)).toBe(before);
      const vendorSchema = { type: 'object', properties: { prompt: { type: 'string' },
        options: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 3 } },
        required: ['prompt', 'options'], additionalProperties: false };
      await provider.sendStreamRequest({ id: 'vendor', messages: [{ role: 'user', content: '原生Schema' }],
        tools: [{ name: 'ask_user', description: 'Vendor-supplied JSON Schema', parameters: vendorSchema }] }, () => {});
      expect(seen).toEqual(vendorSchema);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
