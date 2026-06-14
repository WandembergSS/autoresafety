import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AiAssistantService } from './ai-assistant.service';
import { environment } from '../../environments/environment';

describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let httpMock: HttpTestingController;
  let askUrl: string;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(AiAssistantService);
    httpMock = TestBed.inject(HttpTestingController);
    askUrl = `${environment.backendApiUrl}/ai/ask`;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('keeps structured payloads intact and extracts the AI summary', () => {
    let result: { payload: unknown; summary: string } | undefined;

    service.askWithSummary({ question: 'Return JSON only.', context: '{"seed":true}' }).subscribe((value) => {
      result = value;
    });

    const request = httpMock.expectOne(askUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.context).toBe('{"seed":true}');
    expect(request.request.body.question).toContain('top-level "summary" field');
    expect(request.request.body.question).toContain('If the requested output is plain text');

    request.flush({
      entities: [{ name: 'Controller', roles: ['Controller'] }],
      controlActions: [],
      optionalElements: [],
      summary: 'Added the main controller and left the remaining sections empty for review.'
    });

    expect(result).toEqual({
      payload: {
        entities: [{ name: 'Controller', roles: ['Controller'] }],
        controlActions: [],
        optionalElements: []
      },
      summary: 'Added the main controller and left the remaining sections empty for review.'
    });
  });

  it('normalizes plain-text wrappers so existing text parsers can still read content', () => {
    let result: { payload: unknown; summary: string } | undefined;

    service.askWithSummary({ question: 'Return a system definition.' }).subscribe((value) => {
      result = value;
    });

    const request = httpMock.expectOne(askUrl);
    request.flush('{"content":"System monitors vehicle state and operator commands.","summary":"Defines the monitored system scope in one sentence."}');

    expect(result).toEqual({
      payload: {
        content: 'System monitors vehicle state and operator commands.'
      },
      summary: 'Defines the monitored system scope in one sentence.'
    });
  });

  it('preserves legacy ask payloads without leaking the UI summary field', () => {
    let payload: unknown;

    service.ask({ question: 'Return JSON only.' }).subscribe((value) => {
      payload = value;
    });

    const request = httpMock.expectOne(askUrl);
    request.flush({
      content: 'System boundary text.',
      summary: 'Explains the in-scope boundary in two short phrases.'
    });

    expect(payload).toEqual({ content: 'System boundary text.' });
  });
});