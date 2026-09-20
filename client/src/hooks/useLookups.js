import { useEffect, useState } from 'react';
import { api } from '../services/api';

export function useLookups() {
  const [lookups, setLookups] = useState({});
  useEffect(() => {
    api.get('/lookups').then(setLookups).catch(() => setLookups({}));
  }, []);
  return lookups;
}
