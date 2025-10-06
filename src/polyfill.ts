let storage: Record<string, string> = {};

export const updateStorage = (value: Record<string, any>) =>
    (storage = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [`__MW::${k}`, JSON.stringify(v)])
    ));

updateStorage({
    preferences: {
        state: {
            febboxKey: "exists"
        }
    }
});

(globalThis as any).window = {
    localStorage: {
        getItem: (key: string) => storage[key] || null
    }
};
