import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GenerationRequest {
  taskType: string;
  inputs: string[];
  domainContext?: string;
}

export interface GenerationResponse {
  provider: string;
  model?: string;
  suggestions: string[];
}

export interface AskRequest {
  question: string;
  context?: string;
}

export interface AskResult<T = unknown> {
  payload: T;
  summary: string;
}

@Injectable({ providedIn: 'root' })
export class AiAssistantService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.backendApiUrl}/assistant`;
  private readonly askUrl = `${environment.backendApiUrl}/ai/ask`;
  private readonly summaryInstruction = [
    'ADDITIONAL RESPONSE FORMAT INSTRUCTION:',
    '- Keep the main answer in the exact format requested above.',
    '- Also include a top-level "summary" field with a concise resume of the same answer in at most 2 short sentences.',
    '- The summary is only for UI feedback and must not replace, wrap, or alter the main answer content.',
    '- If the requested output is plain text, return a JSON object with these top-level fields only: { "content": "<main answer>", "summary": "<max 2 short sentences>" }.'
  ].join('\n');

  generate(request: GenerationRequest): Observable<GenerationResponse> {
    return this.http.post<GenerationResponse>(`${this.baseUrl}/generate`, request);
  }

  ask(request: AskRequest): Observable<unknown> {
    return this.sendAsk(request).pipe(map(({ payload }) => payload));
  }

  askWithSummary(request: AskRequest): Observable<AskResult> {
    return this.sendAsk(request);
  }

  private sendAsk(request: AskRequest): Observable<AskResult> {
    return this.http.post<unknown>(this.askUrl, this.withSummaryInstruction(request)).pipe(
      map((response) => this.normalizeAskResponse(response))
    );
  }

  private withSummaryInstruction(request: AskRequest): AskRequest {
    return {
      ...request,
      question: `${request.question.trimEnd()}\n\n${this.summaryInstruction}`
    };
  }

  private normalizeAskResponse(response: unknown): AskResult {
    const parsedResponse = this.parseJsonCandidate(response);
    if (parsedResponse && typeof parsedResponse === 'object' && !Array.isArray(parsedResponse)) {
      const { payload, summary } = this.extractSummaryPayload(parsedResponse as Record<string, unknown>);
      return {
        payload,
        summary: summary || this.buildFallbackSummary(payload)
      };
    }

    return {
      payload: response,
      summary: this.buildFallbackSummary(response)
    };
  }

  private extractSummaryPayload(response: Record<string, unknown>): AskResult {
    const summary = this.readSummaryField(response);

    if (summary) {
      const { summary: _summary, resume: _resume, uiSummary: _uiSummary, shortSummary: _shortSummary, ...payload } = response;
      return {
        payload,
        summary
      };
    }

    return {
      payload: response,
      summary: ''
    };
  }

  private readSummaryField(response: Record<string, unknown>): string {
    const keys = ['summary', 'resume', 'uiSummary', 'shortSummary'];

    for (const key of keys) {
      const value = response[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

  private parseJsonCandidate(response: unknown): unknown {
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      const responseText = this.extractResponseText(response);
      const parsedText = this.tryParseJsonString(responseText);
      return parsedText ?? response;
    }

    if (typeof response !== 'string') {
      return null;
    }

    return this.tryParseJsonString(response);
  }

  private tryParseJsonString(value: string): unknown {
    const normalized = value
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    if (!normalized) {
      return null;
    }

    try {
      return JSON.parse(normalized) as unknown;
    } catch {
      return null;
    }
  }

  private buildFallbackSummary(response: unknown): string {
    const text = this.extractResponseText(response);
    if (!text) {
      return 'AI response applied to the current form.';
    }

    const sentences = text
      .replace(/\s+/g, ' ')
      .trim()
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => sentence.trim().length > 0);

    return sentences.slice(0, 2).join(' ').trim() || text.trim();
  }

  private extractResponseText(response: unknown): string {
    if (typeof response === 'string') {
      return response.trim();
    }

    if (!response || typeof response !== 'object') {
      return '';
    }

    const record = response as Record<string, unknown>;
    const directFields = ['answer', 'response', 'text', 'content', 'message', 'result'];

    for (const key of directFields) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    const choices = record['choices'];
    if (!Array.isArray(choices) || choices.length === 0) {
      return '';
    }

    const firstChoice = choices[0] as Record<string, unknown> | undefined;
    const message = firstChoice?.['message'] as Record<string, unknown> | undefined;
    const messageContent = message?.['content'];
    if (typeof messageContent === 'string' && messageContent.trim()) {
      return messageContent.trim();
    }

    const text = firstChoice?.['text'];
    return typeof text === 'string' ? text.trim() : '';
  }
}
