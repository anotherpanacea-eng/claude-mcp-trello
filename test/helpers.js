export function createAxiosError(message, status, data = {}) {
  return {
    isAxiosError: true,
    message,
    response: status
      ? {
          status,
          data,
        }
      : undefined,
  };
}

export function createFakeAxios(overrides = {}) {
  return {
    get: async () => {
      throw new Error('Unexpected GET request');
    },
    post: async () => {
      throw new Error('Unexpected POST request');
    },
    put: async () => {
      throw new Error('Unexpected PUT request');
    },
    ...overrides,
  };
}
