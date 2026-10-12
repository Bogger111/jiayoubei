import type { Metadata } from "next";
import JiaYouBeiApp from "./JiaYouBeiApp";

export const metadata: Metadata = {
  title: "家有备｜家庭应急 AI Agent",
  description: "理解家庭状态、制定应急计划、协同执行并持续复盘的家庭应急 AI Agent。",
};

export default function Home() {
  return <JiaYouBeiApp />;
}
