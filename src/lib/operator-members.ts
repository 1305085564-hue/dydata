export type OperatorMemberRow = {
  id: string;
  name: string | null;
  team_id: string | null;
};

export type OperatorMemberOption = {
  id: string;
  name: string;
  display_name: string;
  department: string | null;
  team_id: string | null;
  group_id: string | null;
};

export function buildOperatorMemberOptions(
  members: OperatorMemberRow[],
  teams: Array<{ id: string; name: string | null }>,
  groups: Array<{ id: string; name: string | null; team_id: string | null }>,
): OperatorMemberOption[] {
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  return members
    .map((member) => {
      const name = member.name?.trim() || "未命名成员";
      return {
        id: member.id,
        name,
        display_name: name,
        department: teamNameById.get(member.team_id ?? "") ?? null,
        team_id: member.team_id,
        group_id: null,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
}
