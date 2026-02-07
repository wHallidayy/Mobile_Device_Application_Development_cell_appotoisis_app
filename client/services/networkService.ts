import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';

type NetworkListener = (isOnline: boolean) => void;

class NetworkService {
                    private isOnline: boolean = true;
                    private listeners: Set<NetworkListener> = new Set();
                    private unsubscribe: NetInfoSubscription | null = null;

                    /**
                     * Start listening to network changes
                     */
                    start(): void {
                                        if (this.unsubscribe) return;

                                        this.unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
                                                            const wasOnline = this.isOnline;
                                                            this.isOnline = state.isConnected ?? false;

                                                            // Notify listeners if online status changed
                                                            if (wasOnline !== this.isOnline) {
                                                                                this.notifyListeners();
                                                            }
                                        });

                                        // Get initial state
                                        NetInfo.fetch().then((state: NetInfoState) => {
                                                            this.isOnline = state.isConnected ?? false;
                                        });
                    }

                    /**
                     * Stop listening to network changes
                     */
                    stop(): void {
                                        if (this.unsubscribe) {
                                                            this.unsubscribe();
                                                            this.unsubscribe = null;
                                        }
                    }

                    /**
                     * Check if device is currently online
                     */
                    getIsOnline(): boolean {
                                        return this.isOnline;
                    }

                    /**
                     * Check network status (async, fresh check)
                     */
                    async checkNetworkStatus(): Promise<boolean> {
                                        const state = await NetInfo.fetch();
                                        this.isOnline = state.isConnected ?? false;
                                        return this.isOnline;
                    }

                    /**
                     * Subscribe to network changes
                     */
                    addListener(listener: NetworkListener): () => void {
                                        this.listeners.add(listener);
                                        return () => this.listeners.delete(listener);
                    }

                    /**
                     * Notify all listeners of network change
                     */
                    private notifyListeners(): void {
                                        this.listeners.forEach((listener) => {
                                                            listener(this.isOnline);
                                        });
                    }
}

// Export singleton instance
export const networkService = new NetworkService();
