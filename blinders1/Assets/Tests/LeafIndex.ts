import { scenariosIndex } from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import { ScenarioMetadata } from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import { Crit1Mode0Scenario } from "./Crit1Mode0Scenario"
import { Crit2Mode1Scenario } from "./Crit2Mode1Scenario"
import { Crit3Mode2Scenario } from "./Crit3Mode2Scenario"
import { Crit4PersonPauseScenario } from "./Crit4PersonPauseScenario"
import { Crit5MenuScenario } from "./Crit5MenuScenario"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    { id: "crit1-mode0-nothing", typename: Crit1Mode0Scenario.getTypeName() },
    { id: "crit2-mode1-empty-shelf", typename: Crit2Mode1Scenario.getTypeName() },
    { id: "crit3-mode2-everything-fade", typename: Crit3Mode2Scenario.getTypeName() },
    { id: "crit4-person-pause", typename: Crit4PersonPauseScenario.getTypeName() },
    { id: "crit5-menu-lookdown-dwell-pinch", typename: Crit5MenuScenario.getTypeName() },
  ]
}
