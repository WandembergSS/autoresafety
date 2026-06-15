import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthService } from './services/auth.service';

@Component({
  standalone: true,
  selector: 'app-dashboard-stub',
  template: '<p>Dashboard</p>'
})
class DashboardStubComponent {}

@Component({
  standalone: true,
  selector: 'app-scope-stub',
  template: '<p>Scope</p>'
})
class ScopeStubComponent {}

describe('AppComponent', () => {
  let authState: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    authState = signal(false);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([
          { path: '', component: DashboardStubComponent },
          { path: 'scope', component: ScopeStubComponent }
        ]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            authState,
            signOut: jasmine.createSpy('signOut')
          }
        }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'autoresafety-frontend' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.appTitle).toEqual('AutoReSafety');
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('AutoReSafety');
  });

  it('hides the lateral menu on the dashboard even when query params are preserved', fakeAsync(() => {
    authState.set(true);

    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);

    fixture.detectChanges();

    fixture.ngZone?.run(() => {
      void router.navigateByUrl('/scope?projectId=123');
    });
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.shell__nav')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.shell__menu')).not.toBeNull();

    fixture.ngZone?.run(() => {
      void router.navigateByUrl('/?projectId=123');
    });
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.shell__nav')).toBeNull();
    expect(fixture.nativeElement.querySelector('.shell__menu')).toBeNull();
  }));
});
