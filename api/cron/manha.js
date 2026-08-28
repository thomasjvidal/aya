const { enviarLembretes } = require('../_lib/enviarLembretes');

module.exports = async (req, res) => {
  await enviarLembretes(req, res, 'manha');
};
