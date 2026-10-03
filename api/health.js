export default function health(_req, res) {
  res.status(200).json({ status: 'ok' });
}
