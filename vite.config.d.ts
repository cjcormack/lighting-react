declare const _default: {
    plugins: import("vite").PluginOption[][];
    server: {
        open: boolean;
        proxy: {
            '/api': string;
            '/kotlin-compiler-server': string;
        };
    };
};
export default _default;
