const API = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('sahay_token') || sessionStorage.getItem('sahay_token');
}

function clearToken() {
  localStorage.removeItem('sahay_token');
  sessionStorage.removeItem('sahay_token');
}

export { getToken, clearToken };

function messageFrom(data, fallback) {
  const error = data?.error;
  if (typeof error === 'string' && error.trim() && error !== '[object Object]') return error;
  if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  return fallback;
}

export async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('sahay_token');
    sessionStorage.removeItem('sahay_token');
    if (!path.includes('/auth/login')) {
      window.location.href = '/login';
    }
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: 'Unable to load data.' };
  }
  if (!res.ok) {
    const err = new Error(messageFrom(data, 'Unable to complete request.'));
    err.details = data?.details;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body || {}) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body || {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body || {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export function uploadFile(path, body, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let data = null;
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { data = null; }
      if (xhr.status === 401) {
        clearToken();
        window.location.href = '/login';
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(messageFrom(data, 'Unable to upload the file.')));
        return;
      }
      resolve(data);
    };
    xhr.onerror = () => reject(new Error('Unable to upload the file.'));
    xhr.send(body);
  });
}
