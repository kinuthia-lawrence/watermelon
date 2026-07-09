const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// In-memory store
const salesStore = new Map();
let nextId = 1;

function scheduleConfirmation(id) {
  setTimeout(() => {
    const sale = salesStore.get(id);
    if (sale && sale.status === 'pending') {
      sale.status = 'confirmed';
      console.log(`Sale ${id} confirmed`);
    }
  }, 10000); // 10 seconds
}

app.post('/sales', (req, res) => {
  const { productId, productName, quantity, unitPrice, totalPrice } = req.body;
  if (!productId || !productName || !quantity || !unitPrice || !totalPrice) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const id = String(nextId++);
  const sale = {
    id,
    productId,
    productName,
    quantity: Number(quantity),
    unitPrice: String(unitPrice),
    totalPrice: String(totalPrice),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  salesStore.set(id, sale);
  scheduleConfirmation(id);
  res.status(201).json(sale);
});

app.get('/sales/:id/status', (req, res) => {
  const { id } = req.params;
  const sale = salesStore.get(id);
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  res.json({ id, status: sale.status });
});

app.get('/sales', (req, res) => {
  res.json(Array.from(salesStore.values()));
});

app.listen(port, () => {
  console.log(`QuickStock backend at http://localhost:${port}`);
});