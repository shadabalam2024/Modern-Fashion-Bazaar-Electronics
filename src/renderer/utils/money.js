// Indian digit grouping (12,34,567.50). With no `decimals`, whole amounts show without paise.
export const inr = (n, decimals) => Number(n || 0).toLocaleString('en-IN',
  decimals === undefined
    ? { maximumFractionDigits: 2 }
    : { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
