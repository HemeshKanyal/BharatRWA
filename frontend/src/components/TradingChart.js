"use client";

import React, { useEffect, useRef, useState } from "react";

export default function TradingChart({ candles, currentPrice, symbol }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const [chartType, setChartType] = useState("candlestick"); // candlestick | line

  useEffect(() => {
    if (!containerRef.current || !candles || candles.length === 0) return;

    let chart, series;
    const initChart = async () => {
      const { createChart, CandlestickSeries, AreaSeries } = await import("lightweight-charts");

      // Clean up previous
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 420,
        layout: {
          background: { color: "#131722" },
          textColor: "#d1d4dc",
          fontSize: 12,
        },
        grid: {
          vertLines: { color: "rgba(42,46,57,0.5)" },
          horzLines: { color: "rgba(42,46,57,0.5)" },
        },
        crosshair: {
          mode: 0,
          vertLine: { color: "rgba(255,153,51,0.4)", width: 1, style: 2 },
          horzLine: { color: "rgba(255,153,51,0.4)", width: 1, style: 2 },
        },
        rightPriceScale: {
          borderColor: "rgba(42,46,57,0.8)",
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          borderColor: "rgba(42,46,57,0.8)",
          timeVisible: true,
          secondsVisible: false,
        },
      });

      if (chartType === "candlestick") {
        series = chart.addSeries(CandlestickSeries, {
          upColor: "#26a69a",
          downColor: "#ef5350",
          borderDownColor: "#ef5350",
          borderUpColor: "#26a69a",
          wickDownColor: "#ef5350",
          wickUpColor: "#26a69a",
        });
        series.setData(candles);
      } else {
        series = chart.addSeries(AreaSeries, {
          lineColor: "#FF9933",
          topColor: "rgba(255,153,51,0.3)",
          bottomColor: "rgba(255,153,51,0.02)",
          lineWidth: 2,
        });
        series.setData(candles.map((c) => ({ time: c.time, value: c.close })));
      }

      chart.timeScale().fitContent();
      chartRef.current = chart;
      seriesRef.current = series;
    };

    initChart();

    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [candles, chartType]);

  return (
    <div className="chart-wrapper">
      <div className="chart-toolbar">
        <div className="chart-type-tabs">
          <button
            className={`chart-type-btn ${chartType === "candlestick" ? "active" : ""}`}
            onClick={() => setChartType("candlestick")}
          >
            🕯️ Candles
          </button>
          <button
            className={`chart-type-btn ${chartType === "line" ? "active" : ""}`}
            onClick={() => setChartType("line")}
          >
            📈 Line
          </button>
        </div>
        <span className="chart-interval">15m candles</span>
      </div>
      <div ref={containerRef} className="chart-container" />
    </div>
  );
}
