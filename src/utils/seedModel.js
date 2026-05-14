import { useModelStore } from '../store/modelStore';

// Loads a demo Animal meta-model so the canvas isn't empty on first launch.
export function seedDemoModel() {
  useModelStore.setState(
  {
  "metaModel": {
    "kind": "metamodel",
    "name": "Pets",
    "classes": [
      {
        "id": "cls-animal",
        "name": "Animal",
        "isAbstract": true,
        "attributes": [
          {
            "id": "a1",
            "name": "name",
            "type": "STRING",
            "visibility": "PUBLIC",
            "lowerBound": 1,
            "upperBound": 1
          },
          {
            "id": "a2",
            "name": "age",
            "type": "INT",
            "visibility": "PUBLIC",
            "lowerBound": 0,
            "upperBound": 1,
            "defaultValue": "0"
          }
        ]
      },
      {
        "id": "cls-dog",
        "name": "Dog",
        "isAbstract": false,
        "attributes": [
          {
            "id": "a3",
            "name": "breed",
            "type": "STRING",
            "visibility": "PUBLIC",
            "lowerBound": 1,
            "upperBound": 1
          }
        ]
      },
      {
        "id": "cls-cat",
        "name": "Cat",
        "isAbstract": false,
        "attributes": [
          {
            "id": "a4",
            "name": "indoor",
            "type": "BOOLEAN",
            "visibility": "PUBLIC",
            "lowerBound": 1,
            "upperBound": 1
          }
        ]
      },
      {
        "id": "cls-owner",
        "name": "Owner",
        "isAbstract": false,
        "attributes": [
          {
            "id": "a5",
            "name": "fullName",
            "type": "STRING",
            "visibility": "PUBLIC",
            "lowerBound": 1,
            "upperBound": 1
          },
          {
            "id": "a6",
            "name": "email",
            "type": "STRING",
            "visibility": "PRIVATE",
            "lowerBound": 0,
            "upperBound": 1
          }
        ]
      },
      {
        "id": "aa_mA9El",
        "name": "Fish",
        "isAbstract": false,
        "attributes": [
          {
            "id": "Har0fs2R",
            "name": "color",
            "type": "STRING",
            "visibility": "PUBLIC",
            "lowerBound": 1,
            "upperBound": -1
          }
        ]
      }
    ],
    "relations": [
      {
        "id": "rel-1",
        "kind": "INHERITANCE",
        "source": "cls-dog",
        "target": "cls-animal",
        "name": "",
        "sourceMultiplicity": "",
        "targetMultiplicity": "",
        "sourceHandle": "top",
        "targetHandle": "bottom"
      },
      {
        "id": "rel-2",
        "kind": "INHERITANCE",
        "source": "cls-cat",
        "target": "cls-animal",
        "name": "",
        "sourceMultiplicity": "",
        "targetMultiplicity": "",
        "sourceHandle": "top",
        "targetHandle": "bottom"
      },
      {
        "id": "rel-3",
        "kind": "REFERENCE",
        "source": "cls-owner",
        "target": "cls-animal",
        "name": "pets",
        "sourceMultiplicity": "1..*",
        "targetMultiplicity": "0..*",
        "sourceHandle": "top",
        "targetHandle": "right"
      },
      {
        "id": "vwkIV0Oj",
        "kind": "REFERENCE",
        "source": "cls-owner",
        "target": "cls-owner",
        "name": "related",
        "sourceMultiplicity": "0..*",
        "targetMultiplicity": "0..*",
        "sourceHandle": "bottom",
        "targetHandle": "right"
      },
      {
        "id": "W2N9qjJU",
        "kind": "INHERITANCE",
        "source": "aa_mA9El",
        "target": "cls-animal",
        "name": "",
        "sourceMultiplicity": "",
        "targetMultiplicity": "",
        "sourceHandle": "top",
        "targetHandle": "bottom"
      }
    ]
  },
  "instanceModels": [
    {
      "id": "0y5jUBwl",
      "kind": "instancemodel",
      "name": "Family",
      "objects": [
        {
          "id": "mecOp0vA",
          "classId": "cls-owner",
          "className": "Owner",
          "name": "Bob",
          "slots": [
            {
              "attrId": "a5",
              "attrName": "fullName",
              "value": "Bob Smith"
            },
            {
              "attrId": "a6",
              "attrName": "email",
              "value": "bob_smith@gmail.com"
            }
          ]
        },
        {
          "id": "pqelQqxL",
          "classId": "cls-owner",
          "className": "Owner",
          "name": "Alice",
          "slots": [
            {
              "attrId": "a5",
              "attrName": "fullName",
              "value": "Alice Smith"
            },
            {
              "attrId": "a6",
              "attrName": "email",
              "value": "a_smith_89@gmail.com"
            }
          ]
        },
        {
          "id": "hP7rJ06Z",
          "classId": "cls-owner",
          "className": "Owner",
          "name": "Catherine",
          "slots": [
            {
              "attrId": "a5",
              "attrName": "fullName",
              "value": "Catherine Smith"
            },
            {
              "attrId": "a6",
              "attrName": "email",
              "value": "catsmith@gmail.com"
            }
          ]
        },
        {
          "id": "8oJLsMa2",
          "classId": "cls-dog",
          "className": "Dog",
          "name": "Spot",
          "slots": [
            {
              "attrId": "a1",
              "attrName": "name",
              "value": "Spot"
            },
            {
              "attrId": "a2",
              "attrName": "age",
              "value": "8"
            },
            {
              "attrId": "a3",
              "attrName": "breed",
              "value": "Black Lab"
            }
          ]
        },
        {
          "id": "GTNsjLXL",
          "classId": "aa_mA9El",
          "className": "Fish",
          "name": "Goldie",
          "slots": [
            {
              "attrId": "a1",
              "attrName": "name",
              "value": "Goldie"
            },
            {
              "attrId": "a2",
              "attrName": "age",
              "value": "2"
            },
            {
              "attrId": "Har0fs2R",
              "attrName": "color",
              "values": [
                "red",
                "white",
                "orange"
              ]
            }
          ]
        }
      ],
      "links": [
        {
          "id": "K9HfVQ1o",
          "relationId": "vwkIV0Oj",
          "source": "mecOp0vA",
          "target": "pqelQqxL",
          "sourceHandle": "left",
          "targetHandle": "left"
        },
        {
          "id": "eUVj_PiF",
          "relationId": "vwkIV0Oj",
          "source": "mecOp0vA",
          "target": "hP7rJ06Z",
          "sourceHandle": "bottom",
          "targetHandle": "left"
        },
        {
          "id": "g99NLe37",
          "relationId": "vwkIV0Oj",
          "source": "pqelQqxL",
          "target": "hP7rJ06Z",
          "sourceHandle": "top",
          "targetHandle": "bottom"
        },
        {
          "id": "04BfTTL0",
          "relationId": "rel-3",
          "source": "mecOp0vA",
          "target": "8oJLsMa2",
          "sourceHandle": "right",
          "targetHandle": "left"
        },
        {
          "id": "Zt-KSl98",
          "relationId": "rel-3",
          "source": "hP7rJ06Z",
          "target": "8oJLsMa2",
          "sourceHandle": "top",
          "targetHandle": "bottom"
        },
        {
          "id": "RQZUdNfn",
          "relationId": "rel-3",
          "source": "pqelQqxL",
          "target": "8oJLsMa2",
          "sourceHandle": "right",
          "targetHandle": "top"
        },
        {
          "id": "8QrBMhB5",
          "relationId": "rel-3",
          "source": "hP7rJ06Z",
          "target": "GTNsjLXL",
          "sourceHandle": "right",
          "targetHandle": "left"
        }
      ]
    }
  ],
  "layouts": {
    "mm": {
      "cls-animal": {
        "x": 256.40000000000003,
        "y": -115.7772727272727
      },
      "cls-dog": {
        "x": 255.18636363636358,
        "y": 123.43181818181822
      },
      "cls-cat": {
        "x": 461.1090909090908,
        "y": 123.4318181818181
      },
      "cls-owner": {
        "x": 724.4954545454545,
        "y": -0.8499999999999872
      },
      "aa_mA9El": {
        "x": 63.96363636363637,
        "y": 120.63863636363637
      }
    },
    "im-0y5jUBwl": {
      "mecOp0vA": {
        "x": -20.719612284372417,
        "y": -261.57315355854405
      },
      "ejPNeFo3": {
        "x": 571.2363636363636,
        "y": -132.48181818181817
      },
      "pqelQqxL": {
        "x": 626.6180752467276,
        "y": 84.74513483109195
      },
      "hP7rJ06Z": {
        "x": 124.25966467942715,
        "y": -72.94775597770115
      },
      "GBJIEKc5": {
        "x": 145.48181818181817,
        "y": 89.23409090909088
      },
      "PFg03ZfW": {
        "x": 158.84545454545452,
        "y": 99.84147727272725
      },
      "8oJLsMa2": {
        "x": 539.727838485913,
        "y": -272.64283076707636
      },
      "GTNsjLXL": {
        "x": 524.8238237543536,
        "y": -83.93742142194223
      }
    }
  }
}
  );
}
