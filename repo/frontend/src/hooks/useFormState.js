import { useState } from 'react';

export const useFormState = (initial) => {
  const [state, setState] = useState(initial);
  const update = (key, value) => setState((prev) => ({ ...prev, [key]: value }));
  return [state, update, setState];
};
