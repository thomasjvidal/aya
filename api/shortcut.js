const plist = require('plist');

module.exports = (req, res) => {
  const token = req.query.token;
  const app = (req.query.app || 'App').toString().trim();
  const tipo = (req.query.tipo || 'compra').toString().trim();

  if (!token) {
    res.status(400).send('Faltou o parâmetro token');
    return;
  }

  const origin = `https://${req.headers.host}`;
  const nudgeUrl = `${origin}/api/nudge?token=${encodeURIComponent(token)}&tipo=${encodeURIComponent(tipo)}&app=${encodeURIComponent(app)}`;

  const workflow = {
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: '900',
    WFWorkflowIcon: {
      WFWorkflowIconStartColor: 4282601983,
      WFWorkflowIconGlyphNumber: 61440,
    },
    WFWorkflowImportQuestions: [],
    WFWorkflowTypes: [],
    WFWorkflowInputContentItemClasses: [
      'WFAppStoreAppContentItem', 'WFArticleContentItem', 'WFContactContentItem',
      'WFDateContentItem', 'WFEmailAddressContentItem', 'WFGenericFileContentItem',
      'WFImageContentItem', 'WFiTunesProductContentItem', 'WFLocationContentItem',
      'WFDCMapsLinkContentItem', 'WFAVAssetContentItem', 'WFPDFContentItem',
      'WFPhoneNumberContentItem', 'WFRichTextContentItem', 'WFSafariWebPageContentItem',
      'WFStringContentItem', 'WFURLContentItem',
    ],
    WFWorkflowActions: [
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
        WFWorkflowActionParameters: {
          WFURL: nudgeUrl,
          WFHTTPMethod: 'GET',
          ShowHeaders: false,
          UUID: 'AYA00000-0000-0000-0000-000000000001',
        },
      },
    ],
  };

  const xml = plist.build(workflow);
  const fileName = `Aya - ${app}`.replace(/[^a-zA-Z0-9 \-]/g, '');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}.shortcut"`);
  res.status(200).send(xml);
};
