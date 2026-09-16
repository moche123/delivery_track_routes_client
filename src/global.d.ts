declare global {
  interface Window {
    __env?: {
      GOOGLE_CLIENT_ID?: string;
      API_URL?: string;
    };
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export {};