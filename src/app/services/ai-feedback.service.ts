import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class AiFeedbackService {
  private readonly snackBar = inject(MatSnackBar);

  showSuccess(message: string, duration = 5000): void {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) {
      return;
    }

    this.snackBar.open(normalizedMessage, 'OK', {
      duration,
      verticalPosition: 'top',
      horizontalPosition: 'center',
      panelClass: ['ai-snackbar-success']
    });
  }

  showSummary(summary: string, duration = 5000): void {
    this.showSuccess(summary, duration);
  }

  showWarning(message: string, duration = 5000): void {
    this.snackBar.open(message, 'OK', {
      duration,
      verticalPosition: 'top',
      horizontalPosition: 'center',
      panelClass: ['ai-snackbar-warning']
    });
  }

  showPartial(message: string, duration = 7000): void {
    this.snackBar.open(message, 'OK', {
      duration,
      verticalPosition: 'top',
      horizontalPosition: 'center',
      panelClass: ['ai-snackbar-partial']
    });
  }

  showError(message: string, duration = 7000): void {
    this.snackBar.open(message, 'OK', {
      duration,
      verticalPosition: 'top',
      horizontalPosition: 'center',
      panelClass: ['ai-snackbar-error']
    });
  }
}