export type PriceSuggestion = {
  condition: string;
  value: number;
};

export type PriceSuggestionsResponse =
  | {
    available: true;
    currency: string;
    suggestions: PriceSuggestion[];
  }
  | {
    available: false;
    /** `seller_settings`: Discogs only answers once the user has completed their seller profile. */
    reason: 'seller_settings' | 'error';
    message: string | null;
  };
