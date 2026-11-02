export type RootStackParamList = {
  Login: undefined;
  Team: {initialMode?:'companies'|'chat'|'offers';jobId?:string}|undefined;
  Profile: undefined;
  Jobs: undefined;
  JobDetail: { jobId: string };
  JobEditor: { jobId?: string } | undefined;
  Scan: { jobId: string };
  Signature: { jobId: string };
};
