import { describe, expect, it } from 'vitest';
import { parseSessionJsonl } from '../parser.js';

const sourceFile = '/tmp/session.jsonl';

const sessionMeta = JSON.stringify({
  timestamp: '2026-06-07T01:00:00.000Z',
  type: 'session_meta',
  payload: {
    id: 'session-a',
    timestamp: '2026-06-07T00:59:00.000Z',
    cwd: '/tmp/project',
    originator: 'Codex Desktop',
    model_provider: 'openai',
    cli_version: '0.137.0'
  }
});

const sessionMetaWithInstructions = (instructions: string): string =>
  JSON.stringify({
    timestamp: '2026-06-07T01:00:00.000Z',
    type: 'session_meta',
    payload: {
      id: 'session-a',
      timestamp: '2026-06-07T00:59:00.000Z',
      cwd: '/tmp/project',
      originator: 'Codex Desktop',
      model_provider: 'openai',
      cli_version: '0.137.0',
      instructions
    }
  });

const userMessage = (timestamp: string, text: string): string =>
  JSON.stringify({
    timestamp,
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text }]
    }
  });

const turnContext = (
  timestamp: string,
  model = 'gpt-5.5',
  effort = 'high'
): string =>
  JSON.stringify({
    timestamp,
    type: 'turn_context',
    payload: {
      model,
      effort,
      collaboration_mode: {
        settings: {
          model,
          reasoning_effort: effort
        }
      }
    }
  });

const tokenCount = (
  timestamp: string,
  lastTotalTokens: number,
  totalTokens: number,
  inputTokens = lastTotalTokens,
  cachedInputTokens = 0,
  outputTokens = 0,
  reasoningOutputTokens = 0,
  modelContextWindow = 258400
): string =>
  JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        last_token_usage: {
          input_tokens: inputTokens,
          cached_input_tokens: cachedInputTokens,
          output_tokens: outputTokens,
          reasoning_output_tokens: reasoningOutputTokens,
          total_tokens: lastTotalTokens
        },
        total_token_usage: {
          input_tokens: inputTokens,
          cached_input_tokens: cachedInputTokens,
          output_tokens: outputTokens,
          reasoning_output_tokens: reasoningOutputTokens,
          total_tokens: totalTokens
        },
        model_context_window: modelContextWindow
      }
    }
  });

const functionCall = (
  timestamp: string,
  callId: string,
  name: string,
  args: string
): string =>
  JSON.stringify({
    timestamp,
    type: 'response_item',
    payload: {
      type: 'function_call',
      call_id: callId,
      name,
      arguments: args
    }
  });

const functionCallOutput = (
  timestamp: string,
  callId: string,
  output: string
): string =>
  JSON.stringify({
    timestamp,
    type: 'response_item',
    payload: {
      type: 'function_call_output',
      call_id: callId,
      output
    }
  });

describe('parseSessionJsonl', () => {
  it('groups multiple token calls under one Prompt until the next user input', () => {
    const jsonl = [
      sessionMeta,
      turnContext('2026-06-07T01:00:00.500Z', 'gpt-5.5', 'high'),
      userMessage('2026-06-07T01:00:01.000Z', 'Build the dashboard MVP'),
      tokenCount('2026-06-07T01:00:02.000Z', 120, 120, 100, 40, 20, 5),
      tokenCount('2026-06-07T01:00:03.000Z', 80, 200, 50, 10, 30, 0),
      turnContext('2026-06-07T01:00:03.500Z', 'gpt-5.1-codex-max', 'xhigh'),
      userMessage('2026-06-07T01:00:04.000Z', 'Filter by session'),
      tokenCount('2026-06-07T01:00:05.000Z', 35, 235, 25, 5, 10, 1)
    ].join('\n');

    const parsed = parseSessionJsonl(jsonl, sourceFile);

    expect(parsed.session).toMatchObject({
      sessionId: 'session-a',
      sourceFile,
      startedAt: '2026-06-07T00:59:00.000Z',
      cwd: '/tmp/project',
      originator: 'Codex Desktop',
      modelProvider: 'openai',
      cliVersion: '0.137.0',
      lastSeenAt: '2026-06-07T01:00:05.000Z'
    });
    expect(parsed.prompts).toHaveLength(2);
    expect(parsed.prompts[0]).toMatchObject({
      sessionId: 'session-a',
      startedAt: '2026-06-07T01:00:01.000Z',
      promptPreview: 'Build the dashboard MVP',
      callCount: 2,
      model: 'gpt-5.5',
      modelEffort: 'high',
      modelContextWindow: 258400,
      inputTokens: 150,
      cachedInputTokens: 50,
      outputTokens: 50,
      reasoningOutputTokens: 5,
      totalTokens: 200
    });
    expect(parsed.prompts[0].inputSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'user_prompt:User prompt',
          category: 'user_prompt',
          chars: 'Build the dashboard MVP'.length,
          confidence: 'high'
        }),
        expect.objectContaining({
          sourceId: 'runtime_metadata:Runtime metadata',
          category: 'runtime_metadata',
          confidence: 'low'
        })
      ])
    );
    expect(parsed.prompts[1]).toMatchObject({
      promptPreview: 'Filter by session',
      callCount: 1,
      model: 'gpt-5.1-codex-max',
      modelEffort: 'xhigh',
      totalTokens: 35
    });
    expect(parsed.tokenCalls).toHaveLength(3);
    expect(parsed.tokenCalls.map((call) => call.promptId)).toEqual([
      parsed.prompts[0].promptId,
      parsed.prompts[0].promptId,
      parsed.prompts[1].promptId
    ]);
    expect(parsed.validation).toEqual({
      totalTokenDelta: 235,
      lastReportedTotalTokens: 235
    });
  });

  it('breaks tool input context down by tool name', () => {
    const jsonl = [
      sessionMeta,
      userMessage('2026-06-07T01:00:01.000Z', 'Inspect tool output mix'),
      functionCall(
        '2026-06-07T01:00:02.000Z',
        'call-shell',
        'exec_command',
        '{"cmd":"ls"}'
      ),
      functionCallOutput(
        '2026-06-07T01:00:03.000Z',
        'call-shell',
        'shell output'
      ),
      functionCall(
        '2026-06-07T01:00:04.000Z',
        'call-web',
        'web.run',
        '{"open":[]}'
      ),
      functionCallOutput(
        '2026-06-07T01:00:05.000Z',
        'call-web',
        'web output'
      )
    ].join('\n');

    const parsed = parseSessionJsonl(jsonl, sourceFile);

    expect(parsed.prompts[0].inputSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'tool_calls:Tool call: exec_command',
          label: 'Tool call: exec_command',
          chars: '{"cmd":"ls"}'.length
        }),
        expect.objectContaining({
          sourceId: 'tool_outputs:Tool output: exec_command',
          label: 'Tool output: exec_command',
          chars: 'shell output'.length
        }),
        expect.objectContaining({
          sourceId: 'tool_outputs:Tool output: web.run',
          label: 'Tool output: web.run',
          chars: 'web output'.length
        })
      ])
    );
  });

  it('aggregates plugin-bundled skills by plugin name', () => {
    const superpowersBrainstorming =
      '<skill><name>superpowers:brainstorming</name><path>/Users/bytedance/.codex/plugins/cache/openai-curated/superpowers/3f0def1b/skills/brainstorming/SKILL.md</path>Brainstorming guide.</skill>';
    const superpowersVerification =
      '<skill><name>superpowers:verification-before-completion</name><path>/Users/bytedance/.codex/plugins/cache/openai-curated/superpowers/3f0def1b/skills/verification-before-completion/SKILL.md</path>Verification guide.</skill>';
    const standaloneSkill =
      '<skill><name>openai-docs</name><path>/Users/bytedance/.codex/skills/openai-docs/SKILL.md</path>OpenAI docs guide.</skill>';
    const jsonl = [
      sessionMetaWithInstructions(
        `Use these skills:\n${superpowersBrainstorming}\n${superpowersVerification}\n${standaloneSkill}`
      ),
      userMessage('2026-06-07T01:00:01.000Z', 'Inspect skill attribution')
    ].join('\n');

    const parsed = parseSessionJsonl(jsonl, sourceFile);

    expect(parsed.prompts[0].inputSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'instructions_skills:Skill: Superpowers',
          label: 'Skill: Superpowers',
          chars: superpowersBrainstorming.length + superpowersVerification.length,
          events: 2
        }),
        expect.objectContaining({
          sourceId: 'instructions_skills:Skill: openai-docs',
          label: 'Skill: openai-docs',
          chars: standaloneSkill.length,
          events: 1
        })
      ])
    );
    expect(parsed.prompts[0].inputSources).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Skill: brainstorming'
        })
      ])
    );
  });

  it('infers plugin names from plugin-bundled skill paths', () => {
    const skillPath =
      '/Users/bytedance/.codex/plugins/cache/openai-curated/superpowers/3f0def1b/skills/brainstorming/SKILL.md';
    const legacySkillPath =
      '/Users/bytedance/.codex/superpowers/skills/verification-before-completion/SKILL.md';
    const jsonl = [
      sessionMetaWithInstructions(
        `Skill path only: ${skillPath}\nLegacy path: ${legacySkillPath}`
      ),
      userMessage('2026-06-07T01:00:01.000Z', 'Inspect skill path attribution')
    ].join('\n');

    const parsed = parseSessionJsonl(jsonl, sourceFile);

    expect(parsed.prompts[0].inputSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'instructions_skills:Skill: Superpowers',
          label: 'Skill: Superpowers',
          chars: skillPath.length + legacySkillPath.length,
          events: 2
        })
      ])
    );
  });

  it('normalizes and truncates Prompt previews without storing full input text', () => {
    const longInput = `${'alpha '.repeat(30)}beta`;
    const jsonl = [
      sessionMeta,
      userMessage('2026-06-07T01:00:01.000Z', `  ${longInput.replaceAll(' ', '\n\t')}  `)
    ].join('\n');

    const parsed = parseSessionJsonl(jsonl, sourceFile);
    const serializedPrompts = JSON.stringify(parsed.prompts);

    expect(parsed.prompts[0].promptPreview).toHaveLength(120);
    expect(parsed.prompts[0].promptPreview).not.toContain('\n');
    expect(serializedPrompts).not.toContain(longInput);
    expect(parsed.prompts[0]).not.toHaveProperty('promptText');
    expect(parsed.prompts[0]).not.toHaveProperty('text');
  });

  it('creates an unattributed Prompt for token counts before user input', () => {
    const jsonl = [
      sessionMeta,
      tokenCount('2026-06-07T01:00:01.000Z', 44, 44),
      userMessage('2026-06-07T01:00:02.000Z', 'Now start'),
      tokenCount('2026-06-07T01:00:03.000Z', 11, 55)
    ].join('\n');

    const parsed = parseSessionJsonl(jsonl, sourceFile);

    expect(parsed.prompts).toHaveLength(2);
    expect(parsed.prompts[0]).toMatchObject({
      promptPreview: 'unattributed',
      callCount: 1,
      totalTokens: 44
    });
    expect(parsed.prompts[1]).toMatchObject({
      promptPreview: 'Now start',
      callCount: 1,
      totalTokens: 11
    });
  });
});
