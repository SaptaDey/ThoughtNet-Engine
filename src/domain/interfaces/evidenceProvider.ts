
export interface EvidenceProvider {
  search(query: string, numResults?: number): Promise<any[]>;
}
