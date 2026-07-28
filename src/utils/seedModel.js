import { useModelStore } from '../store/modelStore';

// Loads a demo TrafficLight capsule model (UML-RT protocols, ports, capsule
// structure connectors, and a state machine) so the canvas isn't empty on
// first launch.
export function seedDemoModel() {
  useModelStore.setState(
  {
  "metaModel": {
    "kind": "metamodel",
    "name": "Lights",
    "classes": [
      {
        "id": "vPi3gwNf",
        "name": "TrafficLight",
        "isAbstract": false,
        "attributes": [
          {
            "id": "2eLNpUwe",
            "name": "lightColor",
            "type": "ENUM",
            "visibility": "PUBLIC",
            "lowerBound": 1,
            "upperBound": 1,
            "defaultValue": "",
            "enumId": "AYTe_b7V"
          },
          {
            "id": "F0uiSPVF",
            "name": "direction",
            "type": "STRING",
            "visibility": "PUBLIC",
            "lowerBound": 1,
            "upperBound": 1,
            "defaultValue": ""
          }
        ],
        "ports": [
          {
            "id": "vpyOQpuR",
            "name": "oppositeIn",
            "protocolId": "cQS0mgq0",
            "conjugated": false
          },
          {
            "id": "5LtFVlnC",
            "name": "oppositeOut",
            "protocolId": "cQS0mgq0",
            "conjugated": true
          },
          {
            "id": "NVyF6oJk",
            "name": "timer",
            "protocolId": "sys-timing",
            "conjugated": false
          },
          {
            "id": "myjngDry",
            "name": "log",
            "protocolId": "sys-log",
            "conjugated": false
          }
        ]
      }
    ],
    "relations": [
      {
        "id": "jchlZwB9",
        "kind": "REFERENCE",
        "source": "vPi3gwNf",
        "target": "vPi3gwNf",
        "name": "oppositeLight",
        "sourceMultiplicity": "0..1",
        "targetMultiplicity": "0..*",
        "sourceHandle": "top",
        "targetHandle": "right"
      }
    ],
    "enumerations": [
      {
        "id": "AYTe_b7V",
        "name": "LightValue",
        "literals": [
          "RED",
          "YELLOW",
          "GREEN"
        ]
      }
    ],
    "behaviours": {
      "vPi3gwNf": {
        "states": [
          {
            "id": "OWZ7JALs",
            "kind": "simple",
            "name": "Red",
            "entry": "oppositeOut.safe();",
            "exit": ""
          },
          {
            "id": "BJRBFQI4",
            "kind": "simple",
            "name": "Green",
            "entry": "lightColor = LightValue.GREEN;\ntimer.informIn(7000);\nlog.log(direction + \": GREEN\");",
            "exit": ""
          },
          {
            "id": "fStBoHQ5",
            "kind": "simple",
            "name": "Yellow",
            "entry": "lightColor = LightValue.YELLOW;\ntimer.informIn(2000);\nlog.log(direction + \": YELLOW\");",
            "exit": ""
          },
          {
            "id": "4_72OzMo",
            "kind": "initial",
            "name": "",
            "entry": "",
            "exit": ""
          },
          {
            "id": "gudAKRoO",
            "kind": "simple",
            "name": "All Lights Red",
            "entry": "lightColor = LightValue.RED;\nlog.log(direction + \": RED\");\ntimer.informIn(1000);",
            "exit": ""
          }
        ],
        "transitions": [
          {
            "id": "UoQM10wX",
            "source": "OWZ7JALs",
            "target": "BJRBFQI4",
            "trigger": "oppositeIn.safe",
            "guard": "",
            "effect": "",
            "sourceHandle": "bottom",
            "targetHandle": "top"
          },
          {
            "id": "YNDE6FMg",
            "source": "BJRBFQI4",
            "target": "fStBoHQ5",
            "trigger": "timer.timeout",
            "guard": "",
            "effect": "",
            "sourceHandle": "bottom",
            "targetHandle": "top"
          },
          {
            "id": "T-EniMVd",
            "source": "fStBoHQ5",
            "target": "gudAKRoO",
            "trigger": "timer.timeout",
            "guard": "",
            "effect": "",
            "sourceHandle": "left",
            "targetHandle": "bottom"
          },
          {
            "id": "-q4QLibW",
            "source": "4_72OzMo",
            "target": "gudAKRoO",
            "trigger": "",
            "guard": "",
            "effect": "",
            "sourceHandle": "bottom",
            "targetHandle": "left"
          },
          {
            "id": "NMKzuXSv",
            "source": "gudAKRoO",
            "target": "OWZ7JALs",
            "trigger": "timer.timeout",
            "guard": "",
            "effect": "",
            "sourceHandle": "top",
            "targetHandle": "left"
          }
        ]
      }
    },
    "protocols": [
      {
        "id": "cQS0mgq0",
        "name": "opposite",
        "signals": [
          {
            "id": "wlYVmSwO",
            "name": "safe",
            "direction": "in"
          }
        ]
      }
    ]
  },
  "instanceModels": [
    {
      "id": "-R5tzUpx",
      "kind": "instancemodel",
      "name": "LibertyAndLongworth",
      "objects": [
        {
          "id": "bqe7CsQA",
          "classId": "vPi3gwNf",
          "name": "NorthSouth",
          "attributeValues": {
            "2eLNpUwe": "RED",
            "F0uiSPVF": "NS"
          }
        },
        {
          "id": "vsvVNzAT",
          "classId": "vPi3gwNf",
          "name": "EastWest",
          "attributeValues": {
            "2eLNpUwe": "RED",
            "F0uiSPVF": "EW"
          }
        }
      ],
      "links": [
        {
          "id": "ZcEGjM2j",
          "relationId": "jchlZwB9",
          "source": "bqe7CsQA",
          "target": "vsvVNzAT",
          "sourceHandle": "top",
          "targetHandle": "top"
        },
        {
          "id": "1-NWiAEV",
          "relationId": "jchlZwB9",
          "source": "vsvVNzAT",
          "target": "bqe7CsQA",
          "sourceHandle": "bottom",
          "targetHandle": "bottom"
        }
      ],
      "connectors": [
        {
          "id": "jmY59W3W",
          "sourceObjectId": "bqe7CsQA",
          "sourcePortId": "5LtFVlnC",
          "targetObjectId": "vsvVNzAT",
          "targetPortId": "vpyOQpuR"
        },
        {
          "id": "-F3GSY-T",
          "sourceObjectId": "bqe7CsQA",
          "sourcePortId": "vpyOQpuR",
          "targetObjectId": "vsvVNzAT",
          "targetPortId": "5LtFVlnC"
        }
      ]
    }
  ],
  "layouts": {
    "mm": {
      "vPi3gwNf": {
        "x": 116.9262727272727,
        "y": 17.610309090909066
      },
      "AYTe_b7V": {
        "x": 299.7778,
        "y": 278.6325636363636
      }
    },
    "im--R5tzUpx": {
      "bqe7CsQA": {
        "x": 234.04980000000006,
        "y": -4.88863636363638
      },
      "vsvVNzAT": {
        "x": 560.0498,
        "y": -8.38863636363638
      }
    },
    "sm-vPi3gwNf": {
      "OWZ7JALs": {
        "x": 470,
        "y": 148.5
      },
      "BJRBFQI4": {
        "x": 607.5,
        "y": 286
      },
      "fStBoHQ5": {
        "x": 756,
        "y": 451
      },
      "4_72OzMo": {
        "x": 287.0625,
        "y": 115.5
      },
      "gudAKRoO": {
        "x": 330.5,
        "y": 334.5
      }
    },
    "cs--R5tzUpx": {
      "vsvVNzAT": {
        "x": 571.5498,
        "y": -4.88863636363638
      }
    }
  }
}
  );
}
