import { Routes } from '@angular/router';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./pages/home-page/home-page.component').then((m) => m.HomePageComponent)
	},
	{
		path: 'scope',
		loadComponent: () =>
			import('./pages/scope-page/scope-page.component').then((m) => m.ScopePageComponent)
	},
	{
		path: 'istar-models',
		loadComponent: () =>
			import('./pages/istar-models-page/istar-models-page.component').then(
				(m) => m.IstarModelsPageComponent
			)
	},
	{
		path: 'control-structure',
		loadComponent: () =>
			import('./pages/control-structure-page/control-structure-page.component').then(
				(m) => m.ControlStructurePageComponent
			)
	},
	{
		path: 'ucas',
		loadComponent: () =>
			import('./pages/ucas-page/ucas-page.component').then((m) => m.UcasPageComponent)
	},
	{
		path: 'controller-constraints',
		loadComponent: () =>
			import('./pages/controller-constraints-page/controller-constraints-page.component').then(
				(m) => m.ControllerConstraintsPageComponent
			)
	},
	{
		path: 'loss-scenarios',
		loadComponent: () =>
			import('./pages/loss-scenarios-page/loss-scenarios-page.component').then(
				(m) => m.LossScenariosPageComponent
			)
	},
	{
		path: 'model-update',
		loadComponent: () =>
			import('./pages/model-update-page/model-update-page.component').then(
				(m) => m.ModelUpdatePageComponent
			)
	},
	{
		path: '**',
		redirectTo: ''
	}
];
