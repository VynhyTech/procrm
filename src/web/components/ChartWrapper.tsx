import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

const CHART_COLORS = [
  "oklch(0.65 0.09 220)", // info-500
  "oklch(0.65 0.10 162)", // success-500
  "oklch(0.65 0.11 85)",  // warning-500
  "oklch(0.65 0.11 27)",  // error-500
  "oklch(0.65 0.20 328)", // accent-500
  "oklch(0.65 0.15 257)", // primary-ish
  "oklch(0.55 0.09 220)",
  "oklch(0.55 0.10 162)",
];

const CHART_COLORS_ALPHA = CHART_COLORS.map((c) => c.replace(")", " / 0.2)").replace("oklch(", "oklch("));

interface ChartWrapperProps {
  type: "bar" | "line" | "pie" | "doughnut";
  labels: string[];
  values: number[];
  label?: string;
  height?: number;
}

export function ChartWrapper({ type, labels, values, label = "Value", height = 250 }: ChartWrapperProps) {
  const isDark = document.documentElement.classList.contains("dark");
  const textColor = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";
  const gridColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";

  const data = {
    labels,
    datasets: [
      {
        label,
        data: values,
        backgroundColor: type === "bar" || type === "line" ? CHART_COLORS_ALPHA[0] : CHART_COLORS.slice(0, labels.length),
        borderColor: type === "bar" || type === "line" ? CHART_COLORS[0] : CHART_COLORS.slice(0, labels.length),
        borderWidth: type === "pie" || type === "doughnut" ? 2 : 1,
        fill: type === "line",
        tension: 0.3,
      },
    ],
  };

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: type === "pie" || type === "doughnut",
        labels: { color: textColor, font: { size: 11 } },
      },
    },
  };

  const scaleOptions = {
    scales: {
      x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
      y: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor }, beginAtZero: true },
    },
  };

  return (
    <div style={{ height }}>
      {type === "bar" && <Bar data={data} options={{ ...commonOptions, ...scaleOptions }} />}
      {type === "line" && <Line data={data} options={{ ...commonOptions, ...scaleOptions }} />}
      {type === "pie" && <Pie data={data} options={commonOptions} />}
      {type === "doughnut" && <Doughnut data={data} options={commonOptions} />}
    </div>
  );
}
