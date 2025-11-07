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
      controller: 'Infusion Controller',
      controlAction: 'Increase basal rate',
      hazard: 'Over-infusion leading to hypoglycemia',
      category: 'Provided incorrectly'
    },
    {
      id: 2,
      controller: 'Caregiver Portal',
      controlAction: 'Approve configuration change',
      hazard: 'Unsafe regimen activated without dual sign-off',
      category: 'Not provided'
    },
    {
      id: 3,
      controller: 'Cloud Update Service',
      controlAction: 'Deploy firmware patch',
      hazard: 'Pump enters failsafe due to incompatible firmware',
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
