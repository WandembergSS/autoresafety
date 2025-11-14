import { Routes } from '@angular/router';

import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';

export const routes: Routes = [
	{
		path: 'login',
		canActivate: [guestGuard],
		loadComponent: () =>
			import('./pages/login-page/login-page.component').then((m) => m.LoginPageComponent)
	},
	{
		path: '',
		canActivate: [authGuard],
		loadComponent: () =>
			import('./pages/home-page/home-page.component').then((m) => m.HomePageComponent)
	},
	{
		path: 'scope',
		canActivate: [authGuard],
		loadComponent: () =>
			import('./pages/scope-page/scope-page.component').then((m) => m.ScopePageComponent)
	},
	{
		path: 'istar-models',
		canActivate: [authGuard],
		loadComponent: () =>
			import('./pages/istar-models-page/istar-models-page.component').then(
				(m) => m.IstarModelsPageComponent
			)
	},
	{
		path: 'control-structure',
		canActivate: [authGuard],
		loadComponent: () =>
			import('./pages/control-structure-page/control-structure-page.component').then(
				(m) => m.ControlStructurePageComponent
			)
	},
	{
		path: 'ucas',
		canActivate: [authGuard],
		loadComponent: () =>
			import('./pages/ucas-page/ucas-page.component').then((m) => m.UcasPageComponent)
	},
	{
		path: 'controller-constraints',
		canActivate: [authGuard],
		loadComponent: () =>
			import('./pages/controller-constraints-page/controller-constraints-page.component').then(
				(m) => m.ControllerConstraintsPageComponent
			)
	},
	{
		path: 'loss-scenarios',
		canActivate: [authGuard],
		loadComponent: () =>
			import('./pages/loss-scenarios-page/loss-scenarios-page.component').then(
				(m) => m.LossScenariosPageComponent
			)
	},
	{
		path: 'model-update',
		canActivate: [authGuard],
		loadComponent: () =>
			import('./pages/model-update-page/model-update-page.component').then(
				(m) => m.ModelUpdatePageComponent
			)
	},
	{
		path: '**',
		redirectTo: '',
		pathMatch: 'full'
	}
];
