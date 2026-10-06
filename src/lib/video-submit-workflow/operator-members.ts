export type OperatorMember = {
  id: string;
  name: string;
  display_name: string;
  department?: string | null;
  team_id?: string | null;
};

type OperatorMembersFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type OperatorMembersLoader = {
  load: () => Promise<OperatorMember[]>;
  getCached: () => OperatorMember[] | null;
};

export function createOperatorMembersLoader(
  fetchImpl: OperatorMembersFetcher = fetch,
): OperatorMembersLoader {
  let cachedMembers: OperatorMember[] | null = null;
  let membersPromise: Promise<OperatorMember[]> | null = null;

  async function load(): Promise<OperatorMember[]> {
    if (cachedMembers) return cachedMembers;
    if (!membersPromise) {
      membersPromise = fetchImpl("/api/dashboard/operator-members")
        .then(async (res) => (res.ok ? res.json() : null))
        .then((data: { members?: unknown } | null) => {
          if (Array.isArray(data?.members)) {
            cachedMembers = data.members as OperatorMember[];
            return cachedMembers;
          }
          return [];
        })
        .catch(() => [])
        .finally(() => {
          membersPromise = null;
        });
    }
    return membersPromise;
  }

  return {
    load,
    getCached: () => cachedMembers,
  };
}

const defaultOperatorMembersLoader = createOperatorMembersLoader();

export const fetchCachedOperatorMembers = defaultOperatorMembersLoader.load;
export const getCachedOperatorMembers = defaultOperatorMembersLoader.getCached;
