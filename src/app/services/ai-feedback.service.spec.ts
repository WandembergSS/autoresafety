import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AiFeedbackService } from './ai-feedback.service';

describe('AiFeedbackService', () => {
  let service: AiFeedbackService;
  let overlayContainer: OverlayContainer;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MatSnackBarModule],
      providers: [AiFeedbackService, provideNoopAnimations()]
    });

    service = TestBed.inject(AiFeedbackService);
    overlayContainer = TestBed.inject(OverlayContainer);
  });

  afterEach(() => {
    overlayContainer.ngOnDestroy();
  });

  it('keeps the overlay wrapper click-through while the snackbar itself remains interactive', () => {
    service.showSummary('AI summary ready.');

    const container = overlayContainer.getContainerElement();
    const wrapper = container.querySelector('.cdk-global-overlay-wrapper') as HTMLElement | null;
    const snackbar = container.querySelector('.mat-mdc-snack-bar-container') as HTMLElement | null;

    expect(wrapper).withContext('expected the snackbar overlay wrapper to be rendered').not.toBeNull();
    expect(snackbar).withContext('expected the snackbar container to be rendered').not.toBeNull();
    expect(getComputedStyle(container).pointerEvents).toBe('none');
    expect(getComputedStyle(wrapper as HTMLElement).pointerEvents).toBe('none');
    expect(getComputedStyle(snackbar as HTMLElement).pointerEvents).toBe('auto');
  });
});