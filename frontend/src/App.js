import { useMemo, useState } from 'react';
import './App.css';

const resolveApiBaseUrl = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (typeof process !== 'undefined' && process.env?.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL;
  }

  return 'http://localhost:5000';
};

function App() {
  const API_BASE_URL = useMemo(resolveApiBaseUrl, []);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');

  const downloadInvoice = async () => {
    setError('');
    setIsDownloading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/invoice`);

      if (!response.ok) {
        throw new Error('Unable to generate invoice. Please try again.');
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = blobUrl;
      link.setAttribute('download', 'invoice.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Something went wrong');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="card">
        <h1>Invoice Generator</h1>
        <p>Click the button below to download the latest invoice PDF.</p>
        <button onClick={downloadInvoice} disabled={isDownloading}>
          {isDownloading ? 'Downloading…' : 'Download Invoice'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

export default App;
