import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

export type UcaCategory = 'Not provided' | 'Provided incorrectly' | 'Incorrect timing' | 'Stopped too soon / applied too long';

interface UnsafeControlAction {
  id: number;
  controller: string;
  controlAction: string;
  hazard: string;
  category: UcaCategory;
}

@Component({
  selector: 'app-ucas-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ucas-page.component.html',
  styleUrl: './ucas-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UcasPageComponent {
  private readonly fb = inject(FormBuilder);

  readonly ucaForm = this.fb.group({
    controller: ['', Validators.required],
    controlAction: ['', Validators.required],
    hazard: ['', Validators.required],
    category: ['Not provided' as UcaCategory, Validators.required]
  });

  private sequence = 4;

  readonly ucas = signal<UnsafeControlAction[]>([
    {
      id: 1,
      controller: 'Control Application',
      controlAction: 'Release insulin delivery',
      hazard: 'H-2 · Control application releases insulin when glucose level is high',
      category: 'Provided incorrectly'
    },
    {
      id: 2,
      controller: 'Continuous Glucose Monitor',
      controlAction: 'Provide glucose reading',
      hazard: 'H-5 · CGM does not provide a measure when glucose level is high',
      category: 'Not provided'
    },
    {
      id: 3,
      controller: 'Insulin Pump',
      controlAction: 'Deliver insulin bolus',
      hazard: 'H-3 · Pump delivers insulin with a delayed response',
      category: 'Incorrect timing'
    }
  ]);

  addUca(): void {
    if (this.ucaForm.invalid) {
      this.ucaForm.markAllAsTouched();
      return;
    }

    const value = this.ucaForm.getRawValue();
    this.ucas.update((current) => [
      {
        id: ++this.sequence,
        controller: value.controller ?? 'Controller',
        controlAction: value.controlAction ?? 'Control action',
        hazard: value.hazard ?? 'Hazard',
        category: (value.category as UcaCategory) ?? 'Not provided'
      },
      ...current
    ]);

    this.ucaForm.reset({ category: 'Not provided' });
  }

  categoryClass(category: UcaCategory): string {
    return category.replace(/\s+|\//g, '-').toLowerCase();
  }
}
