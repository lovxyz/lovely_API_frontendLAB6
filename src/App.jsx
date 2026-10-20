import { useEffect, useMemo, useState } from 'react';
import './App.css';

const API_BASES = Array.from(new Set([
  import.meta.env.VITE_API_URL,
  'http://localhost:8000',
  'http://127.0.0.1:8000',
].filter(Boolean))).map((base) => base.replace(/\/$/, ''));

const REQUEST_TIMEOUT_MS = 15000;

const emptyProduct = {
  product_name: '',
  description: '',
  price: '',
  quantity: '',
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(localStorage.getItem('access_token')));
  const [authForm, setAuthForm] = useState({ email: 'admin@example.com', password: 'admin123' });
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyProduct);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking');

  const token = useMemo(() => localStorage.getItem('access_token'), [isLoggedIn]);

  useEffect(() => {
    const checkBackend = async () => {
      for (const base of API_BASES) {
        try {
          const res = await fetch(`${base}/api/health`, { method: 'GET' });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data.status === 'ok') {
              setBackendStatus('online');
              return;
            }
          }
        } catch (e) {
          // try next
        }
      }
      setBackendStatus('offline');
    };
    checkBackend();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchProducts();
    }
  }, [isLoggedIn]);

  const handleAuthChange = (e) => {
    setAuthForm({ ...authForm, [e.target.name]: e.target.value });
  };

  const handleFormChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const requestUrl = (path) => API_BASES.map((base) => `${base}${path}`);

  const request = async (url, options = {}, withAuth = true) => {
    const urls = Array.isArray(url) ? url : [url];
    let lastError = null;

    for (const currentUrl of urls) {
      const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

      if (withAuth && token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(currentUrl, {
          ...options,
          headers,
          signal: controller.signal,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || data.message || 'Request failed');
        }

        return data;
      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError') {
          lastError = new Error('Request timed out. Please check the backend server and try again.');
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError || new Error('Request failed');
  };

  const login = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const data = await request(requestUrl('/api/auth/login'), {
        method: 'POST',
        body: JSON.stringify(authForm),
      }, false);

      localStorage.setItem('access_token', data.tokens.access_token);
      localStorage.setItem('refresh_token', data.tokens.refresh_token);
      setIsLoggedIn(true);
      setMessage('Login successful');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await request(requestUrl('/api/auth/logout'), { method: 'POST' });
    } catch {
      // ignore
    } finally {
      localStorage.clear();
      setIsLoggedIn(false);
      setProducts([]);
      setForm(emptyProduct);
      setEditingId(null);
      setMessage('Logged out');
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await request(requestUrl('/api/products'));
      setProducts(data.data || []);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const payload = {
        product_name: form.product_name,
        description: form.description,
        price: Number(form.price),
        quantity: Number(form.quantity),
      };

      if (editingId) {
        await request(requestUrl(`/api/products/${editingId}`), {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMessage('Product updated');
      } else {
        await request(requestUrl('/api/products'), {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMessage('Product added');
      }

      setForm(emptyProduct);
      setEditingId(null);
      fetchProducts();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (product) => {
    setEditingId(product.id);
    setForm({
      product_name: product.product_name,
      description: product.description || '',
      price: product.price,
      quantity: product.quantity,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      await request(requestUrl(`/api/products/${id}`), { method: 'DELETE' });
      setMessage('Product deleted');
      fetchProducts();
    } catch (error) {
      setMessage(error.message);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="app-shell">
        <div className="login-card">
          <div className="status-row">
            <span className={`status-dot ${backendStatus}`} />
            <span>{backendStatus === 'online' ? 'Backend online' : backendStatus === 'offline' ? 'Backend offline' : 'Checking backend...'}</span>
          </div>
          <h1>Product Manager</h1>
          <p className="subtitle">Please sign in to continue</p>

          <form onSubmit={login} className="auth-form">
            <label>
              Email
              <input
                type="email"
                name="email"
                value={authForm.email}
                onChange={handleAuthChange}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                name="password"
                value={authForm.password}
                onChange={handleAuthChange}
                required
              />
            </label>

            <button type="submit" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          {message && <div className="message">{message}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <div>
          <h2>Inventory Dashboard</h2>
        </div>
        <div className="topbar-actions">
          <div className="status-row">
            <span className={`status-dot ${backendStatus}`} />
            <span>{backendStatus === 'online' ? 'API online' : backendStatus === 'offline' ? 'API offline' : 'Checking API...'}</span>
          </div>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="content-grid">
        <section className="panel form-panel">
          <h3>{editingId ? 'Edit Product' : 'Add Product'}</h3>
          <form onSubmit={handleSubmit} className="product-form">
            <label>
              Product Name
              <input
                type="text"
                name="product_name"
                value={form.product_name}
                onChange={handleFormChange}
                required
              />
            </label>

            <label>
              Description
              <textarea
                name="description"
                value={form.description}
                onChange={handleFormChange}
                rows="3"
              />
            </label>

            <div className="two-col">
              <label>
                Price
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="price"
                  value={form.price}
                  onChange={handleFormChange}
                  required
                />
              </label>

              <label>
                Quantity
                <input
                  type="number"
                  min="0"
                  name="quantity"
                  value={form.quantity}
                  onChange={handleFormChange}
                  required
                />
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={loading}>
                {loading ? 'Saving...' : editingId ? 'Update Product' : 'Add Product'}
              </button>
              {editingId && (
                <button type="button" className="secondary" onClick={() => {
                  setEditingId(null);
                  setForm(emptyProduct);
                }}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel table-panel">
          <h3>Products</h3>
          {message && <div className="message small">{message}</div>}
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty">No products found.</td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <strong>{product.product_name}</strong>
                      <div className="desc">{product.description}</div>
                    </td>
                    <td>${Number(product.price).toFixed(2)}</td>
                    <td>{product.quantity}</td>
                    <td className="action-cell">
                      <button type="button" className="small-btn" onClick={() => handleEdit(product)}>Edit</button>
                      <button type="button" className="small-btn danger" onClick={() => handleDelete(product.id)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

export default App;
