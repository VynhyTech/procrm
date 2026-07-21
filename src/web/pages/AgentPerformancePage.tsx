import React, { useEffect, useState, useCallback } from "react";
import { trpc } from "../trpc";
import { MetricCard } from "../components/MetricCard";
import { ChartWrapper } from "../components/ChartWrapper";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { Users, Target, TrendingUp, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";

type LeaderboardData = Awaited<ReturnType<typeof trpc.agentPerformance.getLeaderboard.query>>;
type AgentDetail = Awaited<ReturnType<typeof trpc.agentPerformance.getAgentDetail.query>>;
// Agent type used for rendering

export function AgentPerformancePage() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sortBy, setSortBy] = useState("conversionRate");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { setData(await trpc.agentPerformance.getLeaderboard.query()); } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExpand = async (userId: string) => {
    if (expandedAgent === userId) {
      setExpandedAgent(null);
      setAgentDetail(null);
      return;
    }
    setExpandedAgent(userId);
    setDetailLoading(true);
    try {
      setAgentDetail(await trpc.agentPerformance.getAgentDetail.query({ userId }));
    } catch (err) { console.error(err); } finally { setDetailLoading(false); }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-lg font-semibold text-foreground">Agent Performance</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
        </div>
        <div className="mt-6 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
      </div>
    );
  }

  if (!data) return null;

  const sortedAgents = [...data.agents].sort((a, b) => {
    const agentRecord = Object.fromEntries(Object.entries(a));
    const otherRecord = Object.fromEntries(Object.entries(b));
    const aVal = agentRecord[sortBy];
    const bVal = otherRecord[sortBy];
    if (typeof aVal === "number" && typeof bVal === "number") return bVal - aVal;
    return 0;
  });

  // Chart data for top agents
  const chartAgents = sortedAgents.filter((a) => a.totalLeads > 0).slice(0, 10);

  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-semibold text-foreground">Agent Performance</h1>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Agents" value={data.summary.totalAgents} subtitle={`${data.summary.activeAgents} active`} icon={<Users className="h-5 w-5" />} />
        <MetricCard label="Total Leads" value={data.summary.totalLeads} icon={<Users className="h-5 w-5" />} />
        <MetricCard label="Avg Conversion" value={`${data.summary.avgConversion}%`} icon={<Target className="h-5 w-5" />} />
        <MetricCard label="Total Pipeline" value={`$${data.summary.totalPipeline.toLocaleString()}`} icon={<TrendingUp className="h-5 w-5" />} />
      </div>

      {/* Charts */}
      {chartAgents.length > 1 && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Conversion Rate by Agent</h2>
            <ChartWrapper
              type="bar"
              labels={chartAgents.map((a) => a.user.name ?? a.user.email ?? "Agent")}
              values={chartAgents.map((a) => a.conversionRate)}
              label="Conversion %"
              height={200}
            />
          </div>
          <div className="rounded-xl border border-card-border bg-card p-5 shadow-card">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Pipeline Value by Agent</h2>
            <ChartWrapper
              type="bar"
              labels={chartAgents.map((a) => a.user.name ?? a.user.email ?? "Agent")}
              values={chartAgents.map((a) => a.pipelineValue)}
              label="Pipeline $"
              height={200}
            />
          </div>
        </div>
      )}

      {/* Sort controls */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-foreground-subtle">Sort by:</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-lg border border-input-border bg-input-bg py-1 pl-3 pr-8 text-xs text-input-text outline-none transition-colors focus:border-input-borderFocus"
        >
          <option value="conversionRate">Conversion Rate</option>
          <option value="totalLeads">Total Leads</option>
          <option value="revenue">Revenue</option>
          <option value="pipelineValue">Pipeline Value</option>
          <option value="winRate">Win Rate</option>
          <option value="recentActivities">Recent Activity</option>
          <option value="messagesSent">Messages Sent</option>
        </select>
      </div>

      {/* Agent Leaderboard */}
      {sortedAgents.length === 0 ? (
        <EmptyState title="No agent data yet" description="Agents will appear here once they have leads assigned" icon={<BarChart3 className="h-10 w-10" />} />
      ) : (
        <div className="space-y-2">
          {sortedAgents.map((agent, idx) => {
            const isExpanded = expandedAgent === agent.user.id;
            return (
              <div key={agent.user.id} className="rounded-xl border border-card-border bg-card shadow-card transition-all">
                <button onClick={() => handleExpand(agent.user.id)} className="flex w-full items-center gap-4 p-4 text-left">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background-secondary text-xs font-bold text-foreground-muted">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-2.5">
                    {agent.user.picture ? (
                      <img src={agent.user.picture} className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" alt="" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-accent text-xs font-bold text-white">
                        {(agent.user.name ?? agent.user.email ?? "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{agent.user.name ?? agent.user.email}</p>
                      {agent.user.name && <p className="text-2xs text-foreground-subtle">{agent.user.email}</p>}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-6">
                    <div className="hidden text-center sm:block">
                      <p className="text-xs font-bold text-foreground">{agent.totalLeads}</p>
                      <p className="text-2xs text-foreground-subtle">Leads</p>
                    </div>
                    <div className="hidden text-center sm:block">
                      <p className="text-xs font-bold text-foreground">{agent.conversionRate}%</p>
                      <p className="text-2xs text-foreground-subtle">Conv.</p>
                    </div>
                    <div className="hidden text-center md:block">
                      <p className="text-xs font-bold text-foreground">${agent.revenue.toLocaleString()}</p>
                      <p className="text-2xs text-foreground-subtle">Revenue</p>
                    </div>
                    <div className="hidden text-center md:block">
                      <p className="text-xs font-bold text-foreground">{agent.openOpportunities}</p>
                      <p className="text-2xs text-foreground-subtle">Open Opps</p>
                    </div>
                    <div className="hidden text-center lg:block">
                      <p className="text-xs font-bold text-foreground">{agent.recentActivities}</p>
                      <p className="text-2xs text-foreground-subtle">Activities (7d)</p>
                    </div>
                    <div className="hidden text-center lg:block">
                      <p className="text-xs font-bold text-foreground">{agent.messagesSent}</p>
                      <p className="text-2xs text-foreground-subtle">Messages</p>
                    </div>
                    {agent.overdueTasks > 0 && (
                      <StatusBadge status="High" />
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-foreground-subtle" /> : <ChevronDown className="h-4 w-4 text-foreground-subtle" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3">
                    {detailLoading ? (
                      <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-lg" />)}</div>
                    ) : agentDetail ? (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {/* Leads by Status */}
                        <div className="rounded-lg bg-background-secondary p-3">
                          <h4 className="mb-2 text-xs font-semibold text-foreground">Leads by Status</h4>
                          <div className="space-y-1">
                            {agentDetail.leadsByStatus.map((s) => (
                              <div key={s.status} className="flex items-center justify-between">
                                <StatusBadge status={s.status} />
                                <span className="text-xs font-medium text-foreground">{s.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Opportunities by Stage */}
                        <div className="rounded-lg bg-background-secondary p-3">
                          <h4 className="mb-2 text-xs font-semibold text-foreground">Opportunities by Stage</h4>
                          {agentDetail.opportunitiesByStage.length === 0 ? (
                            <p className="text-xs text-foreground-muted">No opportunities</p>
                          ) : (
                            <div className="space-y-1">
                              {agentDetail.opportunitiesByStage.map((s) => (
                                <div key={s.stage} className="flex items-center justify-between">
                                  <StatusBadge status={s.stage} />
                                  <span className="text-xs font-medium text-foreground">{s.count}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Summary stats */}
                        <div className="rounded-lg bg-background-secondary p-3 md:col-span-2">
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div>
                              <p className="text-2xs text-foreground-subtle">Win Rate</p>
                              <p className="text-sm font-bold text-foreground">{agent.winRate}%</p>
                            </div>
                            <div>
                              <p className="text-2xs text-foreground-subtle">Pipeline Value</p>
                              <p className="text-sm font-bold text-foreground">${agent.pipelineValue.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-2xs text-foreground-subtle">Open Tasks</p>
                              <p className="text-sm font-bold text-foreground">{agent.openTasks}</p>
                            </div>
                            <div>
                              <p className="text-2xs text-foreground-subtle">Overdue Tasks</p>
                              <p className={`text-sm font-bold ${agent.overdueTasks > 0 ? "text-error-500" : "text-foreground"}`}>{agent.overdueTasks}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
