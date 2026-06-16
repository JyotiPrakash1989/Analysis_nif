import { useEffect, useMemo, useRef } from 'react';
import {
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import type { MinuteBar } from '../../types/niftyoptima';

function emaSeries(closes: number[], period: number): (number | undefined)[] {
  const k = 2 / (period + 1);
  const out: (number | undefined)[] = [];
  let prev: number | undefined;
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    if (prev === undefined) {
      prev = c;
    } else {
      prev = c * k + prev * (1 - k);
    }
    out.push(i < period - 1 ? undefined : prev);
  }
  return out;
}

function vwapSeries(bars: MinuteBar[]): { time: number; value: number }[] {
  let cumTp = 0;
  let cumV = 0;
  const out: { time: number; value: number }[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tp = (b.high + b.low + b.close) / 3;
    const v = 1;
    cumTp += tp * v;
    cumV += v;
    out.push({ time: Math.floor(b.time / 1000), value: cumTp / cumV });
  }
  return out;
}

type Props = {
  bars: MinuteBar[];
  height?: number;
  showEma?: boolean;
  showVwap?: boolean;
  emptyMessage?: string;
};

export function MainChart({
  bars,
  height = 360,
  showEma = true,
  showVwap = true,
  emptyMessage = 'Loading NIFTY 1m candles… If this persists, refresh JWT: npm run mstock:totp',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const emaRef = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapRef = useRef<ISeriesApi<'Line'> | null>(null);

  const data = useMemo(() => {
    const sorted = [...bars].sort((a, b) => a.time - b.time);
    const candles = sorted.map((b) => ({
      time: Math.floor(b.time / 1000) as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    const closes = sorted.map((b) => b.close);
    const ema = showEma ? emaSeries(closes, 9) : [];
    const emaData = showEma
      ? (sorted
          .map((b, i) => ({ time: Math.floor(b.time / 1000) as Time, value: ema[i] }))
          .filter((x) => x.value !== undefined) as { time: Time; value: number }[])
      : [];
    const vw = showVwap
      ? vwapSeries(sorted).map((x) => ({
          time: x.time as Time,
          value: x.value,
        }))
      : [];
    return { candles, emaData, vw };
  }, [bars, showEma, showVwap]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0f14' },
        textColor: '#cbd5e1',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      rightPriceScale: { borderColor: '#334155' },
      timeScale: {
        borderColor: '#334155',
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => {
          const sec = typeof time === 'number' ? time : Number((time as { timestamp?: number }).timestamp ?? 0);
          return new Date(sec * 1000).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            day: 'numeric',
            hour12: false,
          });
        },
      },
      localization: {
        timeFormatter: (time: Time) => {
          const sec = typeof time === 'number' ? time : Number((time as { timestamp?: number }).timestamp ?? 0);
          return new Date(sec * 1000).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            day: 'numeric',
            month: 'short',
            hour12: false,
          });
        },
      },
    });
    chartRef.current = chart;
    const candle = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    candleRef.current = candle;
    if (showEma) {
      const emaS = chart.addLineSeries({ color: '#fbbf24', lineWidth: 2, title: 'EMA 9' });
      emaRef.current = emaS;
    }
    if (showVwap) {
      const vwapS = chart.addLineSeries({ color: '#38bdf8', lineWidth: 2, lineStyle: 2, title: 'VWAP' });
      vwapRef.current = vwapS;
    }

    const ro = new ResizeObserver(() => {
      if (!ref.current || !chartRef.current) return;
      chartRef.current.applyOptions({ width: ref.current.clientWidth });
    });
    ro.observe(ref.current);
    chart.applyOptions({ width: ref.current.clientWidth });

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [height, showEma, showVwap]);

  const prevBarCount = useRef(0);

  useEffect(() => {
    if (!candleRef.current) return;
    const n = data.candles.length;
    if (n === 0) {
      candleRef.current.setData([]);
      emaRef.current?.setData([]);
      vwapRef.current?.setData([]);
      prevBarCount.current = 0;
      return;
    }
    const prev = prevBarCount.current;
    if (prev === 0 || n < prev || n - prev > 3) {
      candleRef.current.setData(data.candles);
      emaRef.current?.setData(data.emaData);
      vwapRef.current?.setData(data.vw);
      chartRef.current?.timeScale().fitContent();
    } else if (n > prev) {
      for (let i = prev; i < n; i++) {
        candleRef.current.update(data.candles[i]);
      }
      emaRef.current?.setData(data.emaData);
      vwapRef.current?.setData(data.vw);
    } else {
      candleRef.current.update(data.candles[n - 1]);
      emaRef.current?.setData(data.emaData);
      vwapRef.current?.setData(data.vw);
    }
    prevBarCount.current = n;
  }, [data]);

  const empty = bars.length === 0;

  return (
    <div className="relative w-full min-h-[280px] rounded-xl border border-nox-line bg-nox-bg">
      <div ref={ref} className="w-full" />
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-nox-muted pointer-events-none">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}
