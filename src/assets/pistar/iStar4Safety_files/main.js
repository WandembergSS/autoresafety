/*!
 * This is open-source. Which means that you can contribute to it, and help
 * make it better! Also, feel free to use, modify, redistribute, and so on.
 *
 * If you are going to edit the code, always work from the source-code available for download at
 * https://github.com/jhcp/pistar
 */

$(document).ready(function () {
    'use strict';

    $(document).on('click', 'a[href^="https://www.cin.ufpe.br/~jhcp/pistar/4safety/#"], a[href="#"]', function (event) {
        event.preventDefault();
    });

    istar.graph = istar.setup.setupModel();
    istar.paper = istar.setup.setupDiagram(istar.graph);
    istar.setupMetamodel(istar.metamodel);
    ui.setupUi();

    //wait the ui finish loading before loading a model
    $(document).ready(function () {
        setTimeout(function () {
            if (typeof window.__pistarExternalModelText === 'string' && window.__pistarExternalModelText.trim()) {
                istar.fileManager.loadModel(window.__pistarExternalModelText);
            }
            ui.selectPaper();//clear selection
            }, 5);
    });

    // ui.alert('Hi there, this is a beta version of the tool, currently under testing. Please send us your feedback at <a href="https://goo.gl/forms/SaJlelSfkTkp819t2">https://goo.gl/forms/SaJlelSfkTkp819t2</a>',
    //     'Beta version');
});

/*definition of globals to prevent undue JSHint warnings*/
/*globals istar:false, ui:false, console:false, $:false */